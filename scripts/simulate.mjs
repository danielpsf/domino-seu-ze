const BASE = process.env.BASE || 'http://localhost:5173';
const post = (p, b) => fetch(BASE + p, { method: 'POST', body: JSON.stringify(b) }).then((r) => r.json());
const results = [];
for (const difficulty of ['facil', 'medio', 'dificil', 'mestre']) {
  for (let g = 0; g < (difficulty === 'mestre' ? 2 : 3); g++) {
    const t0 = performance.now();
    let v = await post('/api/new', { difficulty }), requests = 1, hands = 0, guard = 0, falas = 0, slowest = 0;
    while (v.matchWinner === null && guard++ < 400) {
      if (v.error) throw new Error(v.error);
      falas += v.events.filter((e) => e.who === 'bot' && e.fala).length;
      const s = performance.now();
      if (v.handResult) { hands++; v = await post('/api/next', { id: v.id }); }
      else v = await post('/api/play', { id: v.id, moveIndex: Math.floor(Math.random() * v.myMoves.length) });
      slowest = Math.max(slowest, performance.now() - s); requests++;
    }
    results.push({ difficulty, botWon: v.matchWinner === 1, score: v.score, hands: hands + 1, requests, falas, slowest_ms: Math.round(slowest), total_s: +((performance.now() - t0) / 1000).toFixed(1) });
    console.log(JSON.stringify(results.at(-1)));
  }
}
