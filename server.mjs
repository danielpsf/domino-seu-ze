import http from 'node:http';
import { readFile, appendFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickRandom, pickGreedy, pickHard, rankMoves, tileKey } from './ai.mjs';
import { newMatch, startHand, movesFor, play, handOver } from './match.mjs';

const PORT = Number(process.env.PORT || 5173);
const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.DOMINO_MODEL || 'qwen3:8b';
const ROOT = fileURLToPath(new URL('.', import.meta.url));
const LOG_DIR = join(ROOT, 'logs');
const LOG = join(LOG_DIR, 'llm-calls.jsonl');
const BUSY_CMD = process.env.DOMINO_BUSY_CMD;
const HUMAN = 0, BOT = 1;
const LEVELS = ['facil', 'medio', 'dificil', 'mestre'];
const games = new Map();

const fmt = ([a, b]) => `[${a}|${b}]`;
const sameMove = (x, y) => x && y && tileKey(x.tile) === tileKey(y.tile) && x.end === y.end;

// Optional load guard: DOMINO_BUSY_CMD is any command whose output starts with a
// verdict word; SATURATED or DOWN makes the bot skip the model for that turn.
let capacity = { verdict: 'OK', at: 0 };
const machineFree = () => new Promise((resolve) => {
  if (!BUSY_CMD) return resolve(true);
  if (Date.now() - capacity.at < 10_000) return resolve(capacity.verdict !== 'SATURATED' && capacity.verdict !== 'DOWN');
  execFile('/bin/sh', ['-c', BUSY_CMD], { timeout: 2000 }, (err, out) => {
    capacity = { verdict: err ? 'OK' : String(out).trim().split(/\s+/)[0], at: Date.now() };
    resolve(capacity.verdict !== 'SATURATED' && capacity.verdict !== 'DOWN');
  });
});

async function ollama(kind, messages, { format, timeoutMs, numPredict }) {
  const t0 = performance.now();
  const entry = { ts: Date.now() / 1000, kind, model: MODEL };
  if (!(await machineFree())) {
    await appendFile(LOG, JSON.stringify({ ...entry, status: 'skipped-busy', ms: 0 }) + '\n').catch(() => {});
    return null;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST', signal: ctrl.signal, headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL, messages, stream: false, think: false, keep_alive: '10m',
        ...(format ? { format } : {}), options: { temperature: 0.7, num_predict: numPredict },
      }),
    });
    const data = await res.json();
    const ms = Math.round(performance.now() - t0);
    await appendFile(LOG, JSON.stringify({
      ...entry, status: res.ok ? 'ok' : 'error', ms,
      load_ms: Math.round((data.load_duration || 0) / 1e6), eval_count: data.eval_count,
      tps: data.eval_duration ? +(data.eval_count / (data.eval_duration / 1e9)).toFixed(1) : null,
    }) + '\n').catch(() => {});
    return res.ok ? data.message?.content ?? null : null;
  } catch (e) {
    await appendFile(LOG, JSON.stringify({ ...entry, status: e.name === 'AbortError' ? 'timeout' : 'error', ms: Math.round(performance.now() - t0) }) + '\n').catch(() => {});
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const persona = 'Você é o "Seu Zé", veterano de dominó de boteco no Brasil: brincalhão, provocador sem ofender, frases curtas em português do Brasil (você, nunca tu).';

function describe(match) {
  const h = match.hand;
  const ends = h.board.length ? `esquerda=${h.board[0][0]}, direita=${h.board.at(-1)[1]}` : 'mesa vazia';
  return `Sua mão: ${h.hands[BOT].map(fmt).join(' ')}\nPontas: ${ends}\nPeças do adversário: ${h.hands[HUMAN].length}. Placar: você ${match.score[BOT]} x ${match.score[HUMAN]} adversário (vence quem fizer 6).`;
}

async function mestrePick(match, shortlist) {
  const options = shortlist.map((m, i) => `${i}: ${fmt(m.tile)} na ponta ${m.end === 'left' ? 'esquerda' : 'direita'}`).join('\n');
  const content = await ollama('mestre-pick', [
    { role: 'system', content: persona },
    { role: 'user', content: `${describe(match)}\nJogadas candidatas (já filtradas pelo motor):\n${options}\nEscolha uma e provoque o adversário. Responda só JSON.` },
  ], {
    timeoutMs: 6000, numPredict: 80,
    format: { type: 'object', properties: { move: { type: 'integer' }, fala: { type: 'string' } }, required: ['move', 'fala'] },
  });
  try {
    const { move, fala } = JSON.parse(content);
    if (Number.isInteger(move) && move >= 0 && move < shortlist.length) return { move: shortlist[move], fala, source: 'llm' };
  } catch {}
  return { move: shortlist[0], fala: null, source: 'fallback' };
}

async function banter(match, move) {
  const what = move ? `Você acabou de jogar ${fmt(move.tile)}.` : 'Você teve que passar a vez.';
  return ollama('banter', [
    { role: 'system', content: persona },
    { role: 'user', content: `${describe(match)}\n${what} Diga UMA frase curta (máx. 15 palavras) provocando o adversário.` },
  ], { timeoutMs: 4000, numPredict: 40 });
}

const CANNED = ['Tá com medo, é?', 'Essa mesa é minha!', 'Pensa rápido aí, parceiro.', 'Ih, complicou pra você.', 'Joga logo que o boteco fecha às duas!'];

async function botTurn(game) {
  const { match, difficulty } = game;
  const allowed = movesFor(match, BOT);
  let move = null, fala = null, source = 'engine';
  if (allowed.length === 1) move = allowed[0];
  else if (allowed.length > 1) {
    if (difficulty === 'facil') move = pickRandom(match.hand, BOT);
    else if (difficulty === 'medio') move = pickGreedy(match.hand, BOT);
    else if (difficulty === 'dificil') move = pickHard(match.hand, BOT);
    else ({ move, fala, source } = await mestrePick(match, rankMoves(match.hand, BOT).slice(0, 3)));
    if (!allowed.some((m) => sameMove(m, move))) move = allowed[0];
  }
  game.match = play(match, BOT, move);
  if (!fala && (difficulty === 'dificil' || difficulty === 'mestre')) fala = await banter(game.match, move);
  if (!fala && difficulty !== 'facil') fala = CANNED[Math.floor(Math.random() * CANNED.length)];
  game.events.push({ who: 'bot', move, fala: fala?.trim().replace(/^"|"$/g, '') || null, source });
}

async function advance(game) {
  let guard = 0;
  while (!handOver(game.match) && game.match.hand.turn === BOT && guard++ < 30) await botTurn(game);
  // Human with no legal move passes automatically.
  if (!handOver(game.match) && game.match.hand.turn === HUMAN && movesFor(game.match, HUMAN).length === 0) {
    game.match = play(game.match, HUMAN, null);
    game.events.push({ who: 'human', move: null, fala: null, source: 'auto-pass' });
    return advance(game);
  }
}

function view(game) {
  const { match } = game;
  const h = match.hand;
  const over = handOver(match);
  const last = over ? match.history.at(-1) : null;
  return {
    id: game.id, difficulty: game.difficulty, model: MODEL, score: match.score, target: 6,
    handNo: match.handNo, board: h.board, myHand: h.hands[HUMAN],
    myMoves: over ? [] : movesFor(match, HUMAN), oppCount: h.hands[BOT].length,
    sleeping: h.boneyard.length, turn: h.turn, events: game.events.splice(0),
    handResult: last && { kind: last.kind, winner: last.winner, points: last.points, oppHand: last.finalHands[BOT] },
    matchWinner: match.winner,
  };
}

async function body(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

const server = http.createServer(async (req, res) => {
  const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
  try {
    if (req.method === 'POST' && req.url === '/api/new') {
      const { difficulty = 'medio' } = await body(req);
      if (!LEVELS.includes(difficulty)) return send(400, { error: 'dificuldade inválida' });
      const game = { id: randomUUID(), difficulty, match: startHand(newMatch(Math.floor(Math.random() * 1e9))), events: [] };
      games.set(game.id, game);
      await advance(game);
      return send(200, view(game));
    }
    if (req.method === 'POST' && (req.url === '/api/play' || req.url === '/api/next')) {
      const input = await body(req);
      const game = games.get(input.id);
      if (!game) return send(404, { error: 'jogo não encontrado' });
      if (req.url === '/api/next') {
        if (!handOver(game.match) || game.match.winner !== null) return send(409, { error: 'mão em andamento' });
        game.match = startHand(game.match, game.match.history.at(-1).nextStarter ?? HUMAN);
      } else {
        const allowed = movesFor(game.match, HUMAN);
        const move = allowed[input.moveIndex];
        if (!move) return send(400, { error: 'jogada inválida' });
        game.match = play(game.match, HUMAN, move);
        game.events.push({ who: 'human', move, fala: null, source: 'human' });
      }
      await advance(game);
      return send(200, view(game));
    }
    if (req.method === 'GET') {
      const path = req.url === '/' ? '/index.html' : req.url.split('?')[0];
      if (path.includes('..')) return send(400, { error: 'bad path' });
      const file = await readFile(join(ROOT, 'public', path)).catch(() => null);
      if (!file) return send(404, { error: 'not found' });
      res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' });
      return res.end(file);
    }
    send(405, { error: 'method not allowed' });
  } catch (e) {
    send(500, { error: e.message });
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await mkdir(LOG_DIR, { recursive: true });
  server.listen(PORT, '127.0.0.1', () => console.log(`Dominó running at http://localhost:${PORT}  (model: ${MODEL} via ${OLLAMA})`));
}
export { server };
