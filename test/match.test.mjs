import test from 'node:test';
import assert from 'node:assert/strict';
import { newMatch, startHand, movesFor, play, scoreHand, handOver, TARGET } from '../match.mjs';
import { pickHard, pickRandom } from '../ai.mjs';

test('first hand forces the highest double', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const m = startHand(newMatch(seed));
    const moves = movesFor(m, m.hand.turn);
    assert.equal(moves.length, 1);
    const allDoubles = m.hand.hands.flat().filter(([a, b]) => a === b).map(([a]) => a);
    if (allDoubles.length) assert.equal(moves[0].tile[0], Math.max(...allDoubles));
  }
});

test('scoring: batida 1, carroça 2, trancado 1, tie 0', () => {
  assert.deepEqual(scoreHand({ hands: [[], [[1, 2]]], passes: 0 }, [2, 5]).points, 1);
  assert.deepEqual(scoreHand({ hands: [[], [[1, 2]]], passes: 0 }, [4, 4]), { winner: 0, points: 2, kind: 'batida de carroça' });
  assert.deepEqual(scoreHand({ hands: [[[0, 1]], [[6, 6]]], passes: 2 }, null), { winner: 0, points: 1, kind: 'trancado' });
  assert.equal(scoreHand({ hands: [[[0, 3]], [[1, 2]]], passes: 2 }, null).points, 0);
});

test('full matches end at the target with consistent history', () => {
  for (let seed = 1; seed <= 60; seed++) {
    let m = startHand(newMatch(seed)), guard = 0;
    while (m.winner === null && guard++ < 2000) {
      if (handOver(m)) { m = startHand(m, m.history.at(-1).nextStarter); continue; }
      const p = m.hand.turn;
      const moves = movesFor(m, p);
      const pick = moves.length ? (p === 0 ? (pickHard(m.hand, 0) && moves.length > 1 ? pickHard(m.hand, 0) : moves[0]) : moves[Math.floor(Math.random() * moves.length)]) : null;
      m = play(m, p, pick);
    }
    assert.notEqual(m.winner, null);
    assert.ok(m.score[m.winner] >= TARGET);
    assert.equal(m.history.reduce((s, h) => s + h.points, 0), m.score[0] + m.score[1]);
  }
});

test('movesFor is empty for the player who is not on turn', () => {
  const m = startHand(newMatch(3));
  assert.deepEqual(movesFor(m, 1 - m.hand.turn), []);
});
