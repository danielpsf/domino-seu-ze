import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, legalMoves, applyMove, isOver } from '../engine.mjs';
import { pickRandom, pickGreedy, pickHard, rankMoves } from '../ai.mjs';

test('empty board does not crash and picks a legal move', () => {
  const s = newGame(1);
  for (const pick of [pickGreedy, pickHard, (st, p) => pickRandom(st, p, () => 0.5)]) {
    const m = pick(s, 0);
    assert.ok(legalMoves(s, 0).some((x) => x.tile === m.tile && x.end === m.end));
  }
});

test('greedy prefers heaviest, double on tie', () => {
  const s = { hands: [[[1, 5], [3, 3], [0, 1]], [[2, 2]]], board: [[3, 1]], passes: 0 };
  assert.deepEqual(pickGreedy(s, 0).tile, [3, 3]);
});

test('hard bot ignores the opponent hand', () => {
  const base = { hands: [[[6, 4], [4, 1], [6, 2]], [[0, 0]]], board: [[6, 6]], passes: 0 };
  const alt = { ...base, hands: [base.hands[0], [[4, 4], [4, 5], [4, 3]]] };
  assert.deepEqual(rankMoves(base, 0), rankMoves(alt, 0));
});

test('bots finish 300 games with only legal moves', () => {
  const bots = [pickRandom, pickGreedy, pickHard];
  for (let seed = 1; seed <= 100; seed++) {
    for (const bot of bots) {
      let s = newGame(seed), p = 0, guard = 0;
      while (isOver(s) === null && guard++ < 60) {
        s = applyMove(s, p, bot(s, p));
        p = 1 - p;
      }
      assert.notEqual(isOver(s), null);
    }
  }
});

test('hard beats random over 400 games', () => {
  let wins = 0, games = 0;
  for (let seed = 1; seed <= 400; seed++) {
    let s = newGame(seed), p = seed % 2, guard = 0;
    while (isOver(s) === null && guard++ < 60) {
      s = applyMove(s, p, p === 0 ? pickHard(s, 0) : pickRandom(s, 1));
      p = 1 - p;
    }
    const r = isOver(s);
    if (r === 0) wins++;
    if (r === 0 || r === 1) games++;
  }
  assert.ok(wins / games > 0.5, `hard won ${wins}/${games}`);
});
