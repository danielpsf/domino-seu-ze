import { legalMoves } from './engine.mjs';

export const pipSum = (tile) => tile[0] + tile[1];

export const tileKey = (tile) => `${Math.min(...tile)}-${Math.max(...tile)}`;

export const pickRandom = (state, player, rng = Math.random) => {
  const moves = legalMoves(state, player);
  return moves.length ? moves[Math.floor(rng() * moves.length)] : null;
};

export const pickGreedy = (state, player) => {
  const moves = legalMoves(state, player);
  if (!moves.length) return null;
  return moves.reduce((best, move) => {
    const cur = pipSum(move.tile), top = pipSum(best.tile);
    if (cur > top) return move;
    if (cur === top && move.tile[0] === move.tile[1] && best.tile[0] !== best.tile[1]) return move;
    return best;
  });
};

const newOpenEnd = (board, { tile: [a, b], end }) => {
  if (!board.length) return Math.max(a, b);
  const open = end === 'left' ? board[0][0] : board[board.length - 1][1];
  return a === open ? b : a;
};

// Only the bot's own hand and the public board are read, never the opponent's hand.
export const scoreMove = (state, player, move, seen) => {
  const [a, b] = move.tile;
  const end = newOpenEnd(state.board, move);
  const others = state.hands[player].filter((t) => tileKey(t) !== tileKey(move.tile));
  const ownWithEnd = others.filter((t) => t[0] === end || t[1] === end);

  let score = 2 * pipSum(move.tile);
  if (a === b) score += 6;
  score += 3 * ownWithEnd.length;

  const ownKeys = new Set(others.map(tileKey));
  let hidden = 0;
  for (let n = 0; n <= 6; n++) {
    const k = tileKey([n, end]);
    if (!seen.has(k) && !ownKeys.has(k) && k !== tileKey(move.tile)) hidden++;
  }
  score -= 4 * (hidden / 7);
  return score;
};

export const rankMoves = (state, player) => {
  const seen = new Set(state.board.map(tileKey));
  return legalMoves(state, player)
    .map((m) => ({ m, s: scoreMove(state, player, m, seen) }))
    .sort((x, y) => y.s - x.s)
    .map(({ m }) => m);
};

export const pickHard = (state, player) => rankMoves(state, player)[0] ?? null;
