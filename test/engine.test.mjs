import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.mjs';
const orig = E;
const {newGame,legalMoves,applyMove,isOver,winnerOnBlock}=orig;
const key=t=>[...t].sort().join('');
test('deal',()=>{const s=newGame(1);assert.equal(s.hands[0].length,7);assert.equal(s.hands[1].length,7);
 const all=[...s.hands[0],...s.hands[1],...s.boneyard];assert.equal(new Set(all.map(key)).size,28);});
test('deterministic',()=>{assert.deepEqual(newGame(5),newGame(5));assert.notDeepEqual(newGame(5),newGame(6));});
test('empty board: all tiles legal',()=>{assert.equal(legalMoves(newGame(2),0).length,7);});
test('first move works',()=>{const s=newGame(2);const m=legalMoves(s,0)[0];const n=applyMove(s,0,m);assert.equal(n.board.length,1);assert.equal(n.hands[0].length,6);assert.equal(n.turn,1);});
test('tile matching both ends offers both sides',()=>{
 const s={hands:[[[3,3]],[[1,1]]],boneyard:[],board:[[3,4],[5,3]],turn:0,passes:0};
 const ends=legalMoves(s,0).map(m=>m.end).sort();assert.deepEqual(ends,['left','right']);});
test('orientation',()=>{
 const s={hands:[[[2,6],[6,5]],[[1,1]]],boneyard:[],board:[[6,3]],turn:0,passes:0};
 let n=applyMove(s,0,{tile:[2,6],end:'left'});assert.deepEqual(n.board,[[2,6],[6,3]]);
 const s2={hands:[[[3,5]],[[1,1]]],boneyard:[],board:[[6,3]],turn:0,passes:0};
 n=applyMove(s2,0,{tile:[3,5],end:'right'});assert.deepEqual(n.board,[[6,3],[3,5]]);
 const s3={hands:[[[5,6]],[[1,1]]],boneyard:[],board:[[6,3]],turn:0,passes:0};
 n=applyMove(s3,0,{tile:[5,6],end:'left'});assert.deepEqual(n.board,[[5,6],[6,3]]);});
test('chain consistent over random playouts + terminates',()=>{
 for(let seed=1;seed<=200;seed++){let s=newGame(seed),p=0,guard=0;
  while(isOver(s)===null&&guard++<100){const ms=legalMoves(s,p);
   const b0=s.hands[p].length;s=applyMove(s,p,ms.length?ms[0]:null);p=1-p;
   for(let i=1;i<s.board.length;i++)assert.equal(s.board[i-1][1],s.board[i][0],'seed '+seed);}
  assert.ok(isOver(s)!==null);const total=s.hands[0].length+s.hands[1].length+s.board.length;assert.equal(total,14);}});
test('pass/blocked/winner',()=>{
 let s={hands:[[[0,1]],[[6,6]]],boneyard:[],board:[[2,3]],turn:0,passes:0};
 assert.equal(legalMoves(s,0).length,0);s=applyMove(s,0,null);assert.equal(s.passes,1);assert.equal(isOver(s),null);
 s=applyMove(s,1,null);assert.equal(isOver(s),'blocked');assert.equal(winnerOnBlock(s),0);
 assert.equal(isOver({hands:[[],[[1,1]]],passes:0}),0);});
test('no mutation',()=>{const s=newGame(3);const c=JSON.stringify(s);applyMove(s,0,legalMoves(s,0)[0]);assert.equal(JSON.stringify(s),c);});
