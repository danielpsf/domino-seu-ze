import { newGame, legalMoves, applyMove, isOver, winnerOnBlock } from './engine.mjs';

export const TARGET = 6;
const isDouble = ([a, b]) => a === b;
const pips = ([a, b]) => a + b;
const same = (x, y) => (x[0] === y[0] && x[1] === y[1]) || (x[0] === y[1] && x[1] === y[0]);

// First hand: the highest double in play opens (6-6 may be sleeping in the boneyard).
// With no double dealt, the heaviest tile opens.
const forcedOpening = (hands) => {
  const all = hands.flatMap((h, player) => h.map((tile) => ({ tile, player })));
  const doubles = all.filter(({ tile }) => isDouble(tile));
  const pool = doubles.length ? doubles : all;
  return pool.reduce((best, c) => (pips(c.tile) > pips(best.tile) ? c : best));
};

export const newMatch = (seed = Date.now()) => ({
  seed, handNo: 0, score: [0, 0], winner: null, history: [], hand: null, opening: null,
});

export const startHand = (match, starter = null) => {
  const state = newGame(match.seed + match.handNo * 7919);
  let opening = null;
  if (starter === null) {
    opening = forcedOpening(state.hands);
    state.turn = opening.player;
  } else {
    state.turn = starter;
  }
  return { ...match, handNo: match.handNo + 1, hand: state, opening };
};

export const movesFor = (match, player) => {
  const { hand, opening } = match;
  if (!hand || hand.turn !== player || match.winner !== null || isOver(hand) !== null) return [];
  const moves = legalMoves(hand, player);
  if (hand.board.length === 0 && opening) return moves.filter((m) => same(m.tile, opening.tile));
  return moves;
};

// Bar scoring: batida 1, batida de carroça 2, trancado 1 to the lighter hand, tie 0.
export const scoreHand = (hand, lastTile) => {
  const over = isOver(hand);
  if (over === 0 || over === 1) {
    const carroca = lastTile && isDouble(lastTile);
    return { winner: over, points: carroca ? 2 : 1, kind: carroca ? 'batida de carroça' : 'batida' };
  }
  const w = winnerOnBlock(hand);
  if (w === 'draw') return { winner: null, points: 0, kind: 'trancado empatado' };
  return { winner: w, points: 1, kind: 'trancado' };
};

export const play = (match, player, move) => {
  const hand = applyMove(match.hand, player, move);
  if (isOver(hand) === null) return { ...match, hand, opening: hand.board.length ? null : match.opening };
  const result = scoreHand(hand, move?.tile);
  const score = [...match.score];
  if (result.winner !== null) score[result.winner] += result.points;
  const winner = score[0] >= TARGET ? 0 : score[1] >= TARGET ? 1 : null;
  const prevStarter = match.history.length ? match.history.at(-1).nextStarter : null;
  const nextStarter = result.winner ?? prevStarter ?? (match.hand.turn);
  return {
    ...match, hand, opening: null, score, winner,
    history: [...match.history, { ...result, handNo: match.handNo, nextStarter, finalHands: hand.hands }],
  };
};

export const handOver = (match) => match.hand && isOver(match.hand) !== null;
