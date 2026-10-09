const mulberry32 = (a) => {
  return () => {
    a |= 0; a = a + 0x6d2b79f5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) | 0;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
};

const newGame = (seed) => {
  const rng = mulberry32(seed);
  const tiles = [];
  for (let i = 0; i <= 6; i++) {
    for (let j = i; j <= 6; j++) {
      tiles.push([i, j]);
    }
  }
  
  // Shuffle tiles
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  
  // Deal hands
  const hand0 = tiles.slice(0, 7);
  const hand1 = tiles.slice(7, 14);
  const boneyard = tiles.slice(14);
  
  return {
    hands: [hand0, hand1],
    boneyard,
    board: [],
    turn: 0,
    passes: 0
  };
};

const legalMoves = (state, player) => {
  const hand = state.hands[player];
  if (state.board.length === 0) return hand.map(tile => ({ tile, end: 'right' }));
  const l = state.board[0][0];
  const r = state.board[state.board.length - 1][1];
  const moves = [];
  for (const tile of hand) {
    if (tile[0] === l || tile[1] === l) moves.push({ tile, end: 'left' });
    if (tile[0] === r || tile[1] === r) moves.push({ tile, end: 'right' });
  }
  return moves;
};

const applyMove = (state, player, move) => {
  const ns = JSON.parse(JSON.stringify(state));
  ns.turn = 1 - player;
  if (move === null) { ns.passes++; return ns; }
  const { tile, end } = move;
  const i = ns.hands[player].findIndex(t => (t[0] === tile[0] && t[1] === tile[1]) || (t[0] === tile[1] && t[1] === tile[0]));
  if (i === -1) throw new Error('tile not in hand');
  ns.hands[player].splice(i, 1);
  let placed = [tile[0], tile[1]];
  if (ns.board.length === 0) ns.board.push(placed);
  else if (end === 'left') {
    if (placed[1] !== ns.board[0][0]) placed = [placed[1], placed[0]];
    if (placed[1] !== ns.board[0][0]) throw new Error('illegal move');
    ns.board.unshift(placed);
  } else {
    const r = ns.board[ns.board.length - 1][1];
    if (placed[0] !== r) placed = [placed[1], placed[0]];
    if (placed[0] !== r) throw new Error('illegal move');
    ns.board.push(placed);
  }
  ns.passes = 0;
  return ns;
};

const isOver = (state) => {
  if (state.hands[0].length === 0) return 0;
  if (state.hands[1].length === 0) return 1;
  if (state.passes >= 2) return 'blocked';
  return null;
};

const winnerOnBlock = (state) => {
  const pips0 = state.hands[0].reduce((sum, tile) => sum + tile[0] + tile[1], 0);
  const pips1 = state.hands[1].reduce((sum, tile) => sum + tile[0] + tile[1], 0);
  
  if (pips0 < pips1) return 0;
  if (pips1 < pips0) return 1;
  return 'draw';
};

export { newGame, legalMoves, applyMove, isOver, winnerOnBlock };
