// Pure game logic for Go (바둑) and Gomoku (오목).
//
// All functions here are stateless — they take a board and return a result.
// Both the local game (BoardArena) and the online game (OnlineGame) import
// from this file, so the rules stay identical regardless of mode.

export const EMPTY = 0, BLACK = 1, WHITE = 2;
export const KOMI = 6.5;

// ── Common ───────────────────────────────────────────
export function copyBoard(b) { return b.map(r => [...r]); }
export function makeBoard(size) { return Array.from({ length: size }, () => Array(size).fill(EMPTY)); }

export function getStarPoints(size) {
  if (size === 9)  return [[2,2],[6,2],[4,4],[2,6],[6,6]];
  if (size === 13) return [[3,3],[9,3],[6,6],[3,9],[9,9],[3,6],[9,6],[6,3],[6,9]];
  if (size === 15) return [[3,3],[11,3],[7,7],[3,11],[11,11],[3,7],[11,7],[7,3],[7,11]];
  if (size === 19) return [[3,3],[9,3],[15,3],[3,9],[9,9],[15,9],[3,15],[9,15],[15,15]];
  return [];
}

// ══════════════════════════════════════════════════════
//  GO (바둑)
// ══════════════════════════════════════════════════════
export function getNeighbors(x, y, size) {
  const n = [];
  if (x > 0) n.push([x-1,y]); if (x < size-1) n.push([x+1,y]);
  if (y > 0) n.push([x,y-1]); if (y < size-1) n.push([x,y+1]);
  return n;
}

export function findGroup(board, x, y, size) {
  const color = board[y][x];
  if (color === EMPTY) return [];
  const visited = new Set(), stack = [[x,y]], group = [];
  while (stack.length) {
    const [cx,cy] = stack.pop();
    const key = cy*size+cx;
    if (visited.has(key)) continue;
    visited.add(key);
    if (board[cy][cx] !== color) continue;
    group.push([cx,cy]);
    for (const [nx,ny] of getNeighbors(cx,cy,size))
      if (!visited.has(ny*size+nx)) stack.push([nx,ny]);
  }
  return group;
}

export function getGroupLiberties(board, group, size) {
  const libs = new Set();
  for (const [gx,gy] of group)
    for (const [nx,ny] of getNeighbors(gx,gy,size))
      if (board[ny][nx] === EMPTY) libs.add(ny*size+nx);
  return libs.size;
}

export function tryPlaceStone(board, x, y, color, size, koPoint) {
  if (board[y][x] !== EMPTY) return null;
  const nb = copyBoard(board);
  nb[y][x] = color;
  const opp = 3 - color;
  const captured = [];
  for (const [nx,ny] of getNeighbors(x,y,size)) {
    if (nb[ny][nx] === opp) {
      const g = findGroup(nb,nx,ny,size);
      if (getGroupLiberties(nb,g,size) === 0)
        for (const [gx,gy] of g) { nb[gy][gx] = EMPTY; captured.push([gx,gy]); }
    }
  }
  const selfGroup = findGroup(nb,x,y,size);
  if (getGroupLiberties(nb,selfGroup,size) === 0) return null;
  let newKo = null;
  if (captured.length === 1 && selfGroup.length === 1) newKo = { x: captured[0][0], y: captured[0][1] };
  if (koPoint && koPoint.x === x && koPoint.y === y) return null;
  return { board: nb, captured: captured.length, koPoint: newKo };
}

export function calculateTerritory(board, size) {
  const territory = makeBoard(size);
  const visited = makeBoard(size);
  let bT = 0, wT = 0, bS = 0, wS = 0;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      if (board[y][x] === BLACK) bS++;
      if (board[y][x] === WHITE) wS++;
    }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (visited[y][x] || board[y][x] !== EMPTY) continue;
      const region = [], borders = new Set(), stack = [[x,y]];
      while (stack.length) {
        const [cx,cy] = stack.pop();
        if (cx<0||cx>=size||cy<0||cy>=size) continue;
        if (visited[cy][cx]) continue;
        if (board[cy][cx] !== EMPTY) { borders.add(board[cy][cx]); continue; }
        visited[cy][cx] = 1;
        region.push([cx,cy]);
        stack.push([cx-1,cy],[cx+1,cy],[cx,cy-1],[cx,cy+1]);
      }
      let owner = 0;
      if (borders.size === 1) {
        owner = borders.values().next().value;
        if (owner === BLACK) bT += region.length; else wT += region.length;
      }
      for (const [rx,ry] of region) territory[ry][rx] = owner;
    }
  }
  return { territory, blackScore: bS+bT, whiteScore: wS+wT, blackTerritory: bT, whiteTerritory: wT, blackStones: bS, whiteStones: wS };
}

// ── GO AI (Flat MCTS + prior heuristics) ─────────────
function isSimpleEye(board, x, y, color, size) {
  if (board[y][x] !== EMPTY) return false;
  const nbrs = getNeighbors(x,y,size);
  if (!nbrs.every(([nx,ny]) => board[ny][nx] === color)) return false;
  const diags = [];
  if (x>0&&y>0) diags.push(board[y-1][x-1]);
  if (x<size-1&&y>0) diags.push(board[y-1][x+1]);
  if (x>0&&y<size-1) diags.push(board[y+1][x-1]);
  if (x<size-1&&y<size-1) diags.push(board[y+1][x+1]);
  const oppCount = diags.filter(c => c === (3-color)).length;
  return oppCount <= (4 - diags.length > 0 ? 0 : 1);
}

// 정석/포석에서 두는 점들: 화점(4-4), 소목(3-4), 삼삼(3-3), 변 화점.
// getStarPoints를 베이스로 작은 보드에서도 자연스럽게 동작하도록 확장.
function goodOpeningPoints(size) {
  const pts = new Set();
  const add = (x, y) => { if (x>=0&&x<size&&y>=0&&y<size) pts.add(y*size+x); };
  for (const [x,y] of getStarPoints(size)) add(x,y);
  if (size >= 13) {
    // 삼삼 (3-3)
    add(2,2); add(size-3,2); add(2,size-3); add(size-3,size-3);
    // 소목 (3-4 / 4-3)
    add(2,3); add(3,2); add(size-4,2); add(size-3,3);
    add(2,size-4); add(3,size-3); add(size-4,size-3); add(size-3,size-4);
  } else if (size === 9) {
    // 9×9: 화점은 이미 star로 추가됨. 소목 비슷한 (2,3)(3,2) 정도 추가.
    add(2,3); add(3,2); add(5,2); add(6,3); add(2,5); add(3,6); add(5,6); add(6,5);
  }
  return pts;
}

// 한 수의 prior 점수: 정석 위치, 모양, 따냄/단수, 자살수 회피 등을 종합 평가.
// MCTS 전에 후보를 솎아내고 좋은 수를 위로 끌어올리는 용도.
function evalMovePrior(board, x, y, color, size, openingSet, isOpening) {
  let score = 0;
  const opp = 3 - color;
  const edge = Math.min(x, size-1-x, y, size-1-y);

  // 1선·2선 페널티 (포석에서 특히 나쁨)
  if (edge === 0) score -= isOpening ? 60 : 20;
  else if (edge === 1) score -= isOpening ? 25 : 5;
  // 3·4선 보너스 (포석에서)
  if (isOpening && (edge === 2 || edge === 3)) score += 6;

  // 정석/포석 점 보너스 — 포석 단계에서만
  if (isOpening && openingSet.has(y*size+x)) score += 70;

  // 가상 착수로 전술 평가
  const nb = copyBoard(board);
  nb[y][x] = color;
  let captures = 0, atariOpp = 0;
  for (const [nx,ny] of getNeighbors(x,y,size)) {
    if (nb[ny][nx] === opp) {
      const g = findGroup(nb,nx,ny,size);
      const libs = getGroupLiberties(nb,g,size);
      if (libs === 0) { captures += g.length; for (const [gx,gy] of g) nb[gy][gx] = EMPTY; }
      else if (libs === 1) atariOpp += g.length;
    }
  }
  score += captures * 35;
  score += atariOpp * 15;

  // 자기 그룹 활로
  const sg = findGroup(nb,x,y,size);
  const selfLibs = getGroupLiberties(nb,sg,size);
  if (selfLibs === 0) return -1e9; // 자살수
  if (selfLibs === 1) score -= 60;  // 자충
  else if (selfLibs === 2) score -= 8;

  // 단수에 빠진 자기 그룹 살리기
  for (const [nx,ny] of getNeighbors(x,y,size)) {
    if (board[ny][nx] === color) {
      const g = findGroup(board,nx,ny,size);
      if (getGroupLiberties(board,g,size) === 1 && selfLibs >= 2) {
        score += 25; break;
      }
    }
  }

  // 모양: 가까운 우군 돌과의 거리 (체비셰프)
  let minOwn = 99, minOpp = 99;
  for (let yy = 0; yy < size; yy++) {
    for (let xx = 0; xx < size; xx++) {
      const c = board[yy][xx];
      if (c === EMPTY) continue;
      const d = Math.max(Math.abs(xx-x), Math.abs(yy-y));
      if (c === color && d < minOwn) minOwn = d;
      else if (c === opp && d < minOpp) minOpp = d;
    }
  }
  // 한 칸 뜀·날일자 (체비셰프 2)가 가장 좋은 확장
  if (minOwn === 2) score += 10;
  else if (minOwn === 1) score += 3;       // 마늘모·붙임
  else if (minOwn === 3) score += 5;       // 두 칸 벌림
  else if (minOwn >= 5 && isOpening) score -= 4; // 너무 떨어진 외톨이

  // 포석에서 상대와 곧바로 접촉(붙임)하는 수는 일반적으로 손해
  if (isOpening && minOpp === 1 && atariOpp === 0 && captures === 0) score -= 8;

  return score;
}

function fastRandomPlayout(boardIn, color, size) {
  const board = boardIn.map(r => [...r]);
  let cur = color, passes = 0;
  for (let m = 0; m < size*size*2 && passes < 2; m++) {
    const empties = [];
    for (let y=0;y<size;y++) for (let x=0;x<size;x++) if (board[y][x]===EMPTY) empties.push(y*size+x);
    if (!empties.length) { passes++; cur=3-cur; continue; }
    let played = false;
    for (let t=0; t<empties.length; t++) {
      const idx = t + Math.floor(Math.random()*(empties.length-t));
      [empties[t],empties[idx]] = [empties[idx],empties[t]];
      const py = Math.floor(empties[t]/size), px = empties[t]%size;
      if (isSimpleEye(board,px,py,cur,size)) continue;
      board[py][px] = cur;
      const opp = 3-cur; let cap = false;
      for (const [nx,ny] of getNeighbors(px,py,size)) {
        if (board[ny][nx]===opp) {
          const g = findGroup(board,nx,ny,size);
          if (getGroupLiberties(board,g,size)===0) { for (const [gx,gy] of g) board[gy][gx]=EMPTY; cap=true; }
        }
      }
      if (!cap) {
        const sg = findGroup(board,px,py,size);
        if (getGroupLiberties(board,sg,size)===0) { board[py][px]=EMPTY; continue; }
      }
      played = true; break;
    }
    if (played) passes=0; else passes++;
    cur = 3-cur;
  }
  const t = calculateTerritory(board,size);
  return t.blackScore > t.whiteScore + KOMI ? BLACK : WHITE;
}

export function goAiSelectMove(board, color, size, simulations, koPoint) {
  const legalMoves = [];
  let stoneCount = 0;
  for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
    if (board[y][x] !== EMPTY) { stoneCount++; continue; }
    if (koPoint && koPoint.x===x && koPoint.y===y) continue;
    if (tryPlaceStone(board,x,y,color,size,koPoint)) legalMoves.push({x,y});
  }
  if (!legalMoves.length) return null;
  const filtered = legalMoves.filter(m => !isSimpleEye(board,m.x,m.y,color,size));
  const candidates = filtered.length ? filtered : legalMoves;
  if (simulations <= 0) return candidates[Math.floor(Math.random()*candidates.length)];

  // 포석 단계 여부: 보드 면적의 ~20%까지를 포석으로 간주.
  const isOpening = stoneCount < Math.max(6, Math.floor(size * size * 0.22));
  const openingSet = goodOpeningPoints(size);

  // prior로 후보 정렬, 상위 N개만 MCTS로 평가.
  let evalList = candidates.map(m => ({
    move: m,
    wins: 0,
    visits: 0,
    prior: evalMovePrior(board, m.x, m.y, color, size, openingSet, isOpening) + Math.random()*2,
  }));
  evalList.sort((a,b) => b.prior - a.prior);
  // 보드가 클수록 playout이 비싸므로 후보를 더 좁힌다.
  const TOP_N = size <= 9 ? 8 : (size <= 13 ? 9 : 7);
  evalList = evalList.slice(0, TOP_N);

  // 모든 후보가 명백히 나쁘면(자살수 등) prior 1등만 그대로 반환.
  if (evalList[0].prior <= -1e8) {
    return { x: evalList[0].move.x, y: evalList[0].move.y, winRate: 0.5 };
  }

  // 포석 초반은 prior만으로 즉답 (정석 형태 유지 + 19×19 응답 속도 개선).
  // MCTS의 무작위 plyout은 빈 보드에서 잡음이 크고, 정석 위치를 흐트러뜨린다.
  const skipMcts = stoneCount < Math.max(4, Math.floor(size * 0.6));
  if (skipMcts) {
    // 상위 2개 중 무작위 — 항상 같은 첫 수가 나오지 않도록 약간의 다양성.
    const top = evalList.slice(0, Math.min(2, evalList.length));
    const pick = top[Math.floor(Math.random() * top.length)];
    return { x: pick.move.x, y: pick.move.y, winRate: 0.5 };
  }

  const simsPerMove = Math.max(1, Math.floor(simulations / evalList.length));
  for (const stat of evalList) {
    const r = tryPlaceStone(board, stat.move.x, stat.move.y, color, size, koPoint);
    if (!r) continue;
    for (let s = 0; s < simsPerMove; s++) {
      const w = fastRandomPlayout(r.board, 3-color, size);
      stat.visits++; if (w === color) stat.wins++;
    }
  }

  // 최종 선택: 승률 + prior를 결합 (prior는 정석 형태를 유지하는 tie-breaker).
  // prior가 강할수록 (정석 점일수록) 살짝 가산점을 받아, 비슷한 승률이면 정석 자리를 선호.
  const priorMax = Math.max(...evalList.map(s => s.prior));
  const priorMin = Math.min(...evalList.map(s => s.prior));
  const priorRange = Math.max(1, priorMax - priorMin);
  const best = evalList.reduce((a, b) => {
    const sa = (a.visits ? a.wins/a.visits : 0.5) + 0.05*((a.prior - priorMin)/priorRange);
    const sb = (b.visits ? b.wins/b.visits : 0.5) + 0.05*((b.prior - priorMin)/priorRange);
    return sa >= sb ? a : b;
  });
  const winRate = best.visits ? best.wins / best.visits : 0.5;
  return { x: best.move.x, y: best.move.y, winRate };
}

export function getGoSims(diff, size) {
  // prior 휴리스틱 도입으로 후보 수가 30 → 8~12로 줄어들어,
  // 동일/그 이상 강도를 더 낮은 sim 예산으로 달성. 어려움이 1초 안에 응답.
  const t = {
    9:  { easy: 80, medium: 300, hard: 600 },
    13: { easy: 40, medium: 120, hard: 220 },
    15: { easy: 30, medium: 80,  hard: 150 },
    19: { easy: 18, medium: 50,  hard: 100 },
  };
  return (t[size] || t[9])[diff] || 200;
}

// ══════════════════════════════════════════════════════
//  GOMOKU (오목)
// ══════════════════════════════════════════════════════
export function checkWinAt(board, x, y, size) {
  const color = board[y][x];
  if (color === EMPTY) return false;
  const dirs = [[1,0],[0,1],[1,1],[1,-1]];
  for (const [dx,dy] of dirs) {
    let count = 1;
    for (let i=1;i<5;i++) { const nx=x+dx*i,ny=y+dy*i; if (nx<0||nx>=size||ny<0||ny>=size||board[ny][nx]!==color) break; count++; }
    for (let i=1;i<5;i++) { const nx=x-dx*i,ny=y-dy*i; if (nx<0||nx>=size||ny<0||ny>=size||board[ny][nx]!==color) break; count++; }
    if (count >= 5) return true;
  }
  return false;
}

export function findWinLine(board, x, y, size) {
  const color = board[y][x];
  const dirs = [[1,0],[0,1],[1,1],[1,-1]];
  for (const [dx,dy] of dirs) {
    const line = [[x,y]];
    for (let i=1;i<5;i++) { const nx=x+dx*i,ny=y+dy*i; if (nx<0||nx>=size||ny<0||ny>=size||board[ny][nx]!==color) break; line.push([nx,ny]); }
    for (let i=1;i<5;i++) { const nx=x-dx*i,ny=y-dy*i; if (nx<0||nx>=size||ny<0||ny>=size||board[ny][nx]!==color) break; line.push([nx,ny]); }
    if (line.length >= 5) {
      line.sort((a,b) => a[0]===b[0]?a[1]-b[1]:a[0]-b[0]);
      return line;
    }
  }
  return null;
}

export function checkBoardWin(board, size) {
  for (let y=0;y<size;y++) for (let x=0;x<size;x++)
    if (board[y][x]!==EMPTY && checkWinAt(board,x,y,size)) return board[y][x];
  return null;
}

// ── GOMOKU AI (Minimax + Alpha-Beta) ─────────────────
function getGomokuCandidates(board, size) {
  const set = new Set();
  let hasStone = false;
  for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
    if (board[y][x] !== EMPTY) {
      hasStone = true;
      for (let dy=-2;dy<=2;dy++) for (let dx=-2;dx<=2;dx++) {
        const nx=x+dx, ny=y+dy;
        if (nx>=0&&nx<size&&ny>=0&&ny<size&&board[ny][nx]===EMPTY) set.add(ny*size+nx);
      }
    }
  }
  if (!hasStone) return [[Math.floor(size/2), Math.floor(size/2)]];
  return [...set].map(p => [p%size, Math.floor(p/size)]);
}

function evalGomoku(board, size, color) {
  let score = 0;
  const opp = 3 - color;
  const dirs = [[1,0],[0,1],[1,1],[1,-1]];
  for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
    for (const [dx,dy] of dirs) {
      const ex = x+dx*4, ey = y+dy*4;
      if (ex<0||ex>=size||ey<0||ey>=size) continue;
      let own=0, op=0;
      for (let i=0;i<5;i++) {
        const c = board[y+dy*i][x+dx*i];
        if (c===color) own++; else if (c===opp) op++;
      }
      if (op===0) {
        if (own===5) score+=1000000;
        else if (own===4) score+=50000;
        else if (own===3) score+=5000;
        else if (own===2) score+=500;
        else if (own===1) score+=50;
      }
      if (own===0) {
        if (op===5) score-=1000000;
        else if (op===4) score-=80000;
        else if (op===3) score-=8000;
        else if (op===2) score-=600;
        else if (op===1) score-=60;
      }
    }
  }
  return score;
}

function quickScore(board, x, y, color, size) {
  board[y][x] = color;
  const s1 = evalGomoku(board, size, color);
  board[y][x] = 3-color;
  const s2 = evalGomoku(board, size, color);
  board[y][x] = EMPTY;
  return s1 - s2;
}

function gomokuMinimax(board, size, depth, alpha, beta, isMax, aiColor) {
  const w = checkBoardWin(board, size);
  if (w === aiColor) return 1000000 + depth;
  if (w === (3-aiColor)) return -1000000 - depth;
  if (depth === 0) return evalGomoku(board, size, aiColor);

  let candidates = getGomokuCandidates(board, size);
  if (!candidates.length) return 0;

  const cur = isMax ? aiColor : 3-aiColor;
  candidates = candidates.map(([x,y]) => ({ x, y, s: quickScore(board,x,y,cur,size) }));
  candidates.sort((a,b) => isMax ? b.s-a.s : a.s-b.s);
  candidates = candidates.slice(0, 15);

  if (isMax) {
    let maxE = -Infinity;
    for (const {x,y} of candidates) {
      board[y][x] = aiColor;
      const e = gomokuMinimax(board,size,depth-1,alpha,beta,false,aiColor);
      board[y][x] = EMPTY;
      maxE = Math.max(maxE,e); alpha = Math.max(alpha,e);
      if (beta<=alpha) break;
    }
    return maxE;
  } else {
    let minE = Infinity;
    for (const {x,y} of candidates) {
      board[y][x] = 3-aiColor;
      const e = gomokuMinimax(board,size,depth-1,alpha,beta,true,aiColor);
      board[y][x] = EMPTY;
      minE = Math.min(minE,e); beta = Math.min(beta,e);
      if (beta<=alpha) break;
    }
    return minE;
  }
}

export function gomokuAiMove(board, color, size, difficulty) {
  const depthMap = { easy: 1, medium: 2, hard: 4 };
  const depth = depthMap[difficulty] || 2;
  let candidates = getGomokuCandidates(board, size);
  if (!candidates.length) return null;

  // Immediate win
  for (const [x,y] of candidates) {
    board[y][x] = color;
    const win = checkWinAt(board,x,y,size);
    board[y][x] = EMPTY;
    if (win) return {x,y};
  }
  // Block opponent win
  for (const [x,y] of candidates) {
    board[y][x] = 3-color;
    const win = checkWinAt(board,x,y,size);
    board[y][x] = EMPTY;
    if (win) return {x,y};
  }

  const scored = candidates.map(([x,y]) => ({ x, y, s: quickScore(board,x,y,color,size) }));
  scored.sort((a,b) => b.s - a.s);
  const topMoves = scored.slice(0, depth <= 1 ? 10 : 15);

  let bestMove = topMoves[0], bestScore = -Infinity, bestRawScore = -Infinity;
  for (const {x,y} of topMoves) {
    board[y][x] = color;
    const score = gomokuMinimax(board, size, depth-1, -Infinity, Infinity, false, color);
    board[y][x] = EMPTY;
    const noise = difficulty === 'easy' ? (Math.random()-0.5)*20000 : 0;
    if (score + noise > bestScore) { bestScore = score + noise; bestRawScore = score; bestMove = {x,y}; }
  }
  return { ...bestMove, evalScore: bestRawScore };
}

// ══════════════════════════════════════════════════════
//  Board serialization (for Firestore)
// ══════════════════════════════════════════════════════
// Firestore can't store nested arrays well, so we flatten to a string.
export function serializeBoard(board) {
  return board.map(row => row.join('')).join('');
}

export function deserializeBoard(str, size) {
  const board = makeBoard(size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      board[y][x] = Number(str[y*size+x]) || EMPTY;
  return board;
}
