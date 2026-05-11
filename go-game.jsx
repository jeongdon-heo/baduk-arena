import React, { useState, useCallback, useEffect } from "react";

const EMPTY = 0, BLACK = 1, WHITE = 2;
const KOMI = 6.5;

// ══════════════════════════════════════════
//  SHARED UTILITIES
// ══════════════════════════════════════════
function copyBoard(b) { return b.map(r => [...r]); }
function makeBoard(size) { return Array.from({ length: size }, () => Array(size).fill(EMPTY)); }

function getStarPoints(size) {
  if (size === 9) return [[2,2],[6,2],[4,4],[2,6],[6,6]];
  if (size === 13) return [[3,3],[9,3],[6,6],[3,9],[9,9],[3,6],[9,6],[6,3],[6,9]];
  if (size === 15) return [[3,3],[11,3],[7,7],[3,11],[11,11],[3,7],[11,7],[7,3],[7,11]];
  if (size === 19) return [[3,3],[9,3],[15,3],[3,9],[9,9],[15,9],[3,15],[9,15],[15,15]];
  return [];
}

// ══════════════════════════════════════════
//  GO (바둑) LOGIC
// ══════════════════════════════════════════
function getNeighbors(x, y, size) {
  const n = [];
  if (x > 0) n.push([x-1,y]); if (x < size-1) n.push([x+1,y]);
  if (y > 0) n.push([x,y-1]); if (y < size-1) n.push([x,y+1]);
  return n;
}

function findGroup(board, x, y, size) {
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

function getGroupLiberties(board, group, size) {
  const libs = new Set();
  for (const [gx,gy] of group)
    for (const [nx,ny] of getNeighbors(gx,gy,size))
      if (board[ny][nx] === EMPTY) libs.add(ny*size+nx);
  return libs.size;
}

function tryPlaceStone(board, x, y, color, size, koPoint) {
  if (board[y][x] !== EMPTY) return null;
  const nb = copyBoard(board);
  nb[y][x] = color;
  const opp = 3 - color;
  let captured = [];
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

function calculateTerritory(board, size) {
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

// ── GO AI (Flat MCTS) ──
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

function goAiSelectMove(board, color, size, simulations, koPoint) {
  const legalMoves = [];
  for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
    if (board[y][x]!==EMPTY) continue;
    if (koPoint&&koPoint.x===x&&koPoint.y===y) continue;
    if (tryPlaceStone(board,x,y,color,size,koPoint)) legalMoves.push({x,y});
  }
  if (!legalMoves.length) return null;
  const filtered = legalMoves.filter(m => !isSimpleEye(board,m.x,m.y,color,size));
  const candidates = filtered.length ? filtered : legalMoves;
  if (simulations <= 0) return candidates[Math.floor(Math.random()*candidates.length)];

  const capSet = new Set();
  for (const m of candidates) {
    const r = tryPlaceStone(board,m.x,m.y,color,size,koPoint);
    if (r && r.captured > 0) capSet.add(m.x+","+m.y);
  }

  let evalList = candidates.map(m => {
    const cx=size/2, cy=size/2, dist = Math.abs(m.x-cx)+Math.abs(m.y-cy);
    return { move:m, wins:0, visits:0, priority: (capSet.has(m.x+","+m.y)?100:0)-dist+Math.random()*3 };
  });
  evalList.sort((a,b) => b.priority-a.priority);
  evalList = evalList.slice(0, 30);

  const simsPerMove = Math.max(1, Math.floor(simulations/evalList.length));
  for (const stat of evalList) {
    const r = tryPlaceStone(board,stat.move.x,stat.move.y,color,size,koPoint);
    if (!r) continue;
    for (let s=0; s<simsPerMove; s++) {
      const w = fastRandomPlayout(r.board, 3-color, size);
      stat.visits++; if (w===color) stat.wins++;
    }
  }
  return evalList.reduce((a,b) => {
    if (!a.visits) return b; if (!b.visits) return a;
    return (a.wins/a.visits)>(b.wins/b.visits)?a:b;
  }).move;
}

function getGoSims(diff, size) {
  const t = { 9:{easy:100,medium:600,hard:2000}, 13:{easy:60,medium:300,hard:800}, 19:{easy:30,medium:150,hard:400} };
  return (t[size]||t[9])[diff]||200;
}

// ══════════════════════════════════════════
//  GOMOKU (오목) LOGIC
// ══════════════════════════════════════════
function checkWinAt(board, x, y, size) {
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

function findWinLine(board, x, y, size) {
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

function checkBoardWin(board, size) {
  for (let y=0;y<size;y++) for (let x=0;x<size;x++)
    if (board[y][x]!==EMPTY && checkWinAt(board,x,y,size)) return board[y][x];
  return null;
}

// ── GOMOKU AI (Minimax + Alpha-Beta) ──
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

function gomokuAiMove(board, color, size, difficulty) {
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

  let bestMove = topMoves[0], bestScore = -Infinity;
  for (const {x,y} of topMoves) {
    board[y][x] = color;
    const score = gomokuMinimax(board, size, depth-1, -Infinity, Infinity, false, color);
    board[y][x] = EMPTY;
    const noise = difficulty === "easy" ? (Math.random()-0.5)*20000 : 0;
    if (score + noise > bestScore) { bestScore = score + noise; bestMove = {x,y}; }
  }
  return bestMove;
}

// ══════════════════════════════════════════
//  STYLES
// ══════════════════════════════════════════
const FONT = "'Noto Serif KR', Georgia, serif";
const C = {
  bg: "#1a1410", card: "rgba(60,48,36,0.95)", cardDk: "rgba(40,30,22,0.98)",
  gold: "#c9a96e", goldDim: "rgba(180,140,70,0.15)",
  t1: "#e8d5b5", t2: "#d4c0a0", t3: "#b8a080", t4: "#8a7560", t5: "rgba(200,175,140,0.6)",
  bdr: "rgba(180,150,100,0.2)",
};

const optBtn = (on) => ({
  flex: 1, padding: "10px 0", borderRadius: 8,
  border: on ? `2px solid ${C.gold}` : `1px solid ${C.bdr}`,
  background: on ? C.goldDim : "transparent",
  color: on ? C.t1 : C.t4,
  fontFamily: FONT, fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "all 0.2s",
});

const gameBtn = {
  padding: "8px 16px", borderRadius: 8,
  border: `1px solid rgba(180,150,100,0.3)`,
  background: "rgba(60,48,36,0.8)", color: C.t2,
  fontFamily: FONT, fontSize: 13, fontWeight: 600, cursor: "pointer",
};

// ══════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════
export default function BoardArena() {
  const [screen, setScreen] = useState("home");
  const [gameType, setGameType] = useState(null);

  const [boardSize, setBoardSize] = useState(9);
  const [mode, setMode] = useState("pvp");
  const [difficulty, setDifficulty] = useState("medium");
  const [playerColor, setPlayerColor] = useState(BLACK);

  const [board, setBoard] = useState(null);
  const [currentColor, setCurrentColor] = useState(BLACK);
  const [koPoint, setKoPoint] = useState(null);
  const [lastMove, setLastMove] = useState(null);
  const [blackCap, setBlackCap] = useState(0);
  const [whiteCap, setWhiteCap] = useState(0);
  const [history, setHistory] = useState([]);
  const [passCount, setPassCount] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [scores, setScores] = useState(null);
  const [terrMap, setTerrMap] = useState(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [moveNum, setMoveNum] = useState(0);
  const [hover, setHover] = useState(null);
  const [winner, setWinner] = useState(null);
  const [winLine, setWinLine] = useState(null);

  const goSettings = (type) => {
    setGameType(type);
    setBoardSize(type === "go" ? 9 : 15);
    setMode("pvp"); setDifficulty("medium"); setPlayerColor(BLACK);
    setScreen("settings");
  };

  const startGame = () => {
    setBoard(makeBoard(boardSize));
    setCurrentColor(BLACK); setKoPoint(null); setLastMove(null);
    setBlackCap(0); setWhiteCap(0); setHistory([]); setPassCount(0);
    setGameOver(false); setScores(null); setTerrMap(null);
    setAiThinking(false); setMoveNum(0); setWinner(null); setWinLine(null);
    setScreen("game");
  };

  const snap = () => ({ board: copyBoard(board), currentColor, koPoint, blackCap, whiteCap, lastMove, passCount, moveNum });

  // ── Place stone ──
  const placeStone = useCallback((x, y) => {
    if (gameOver || aiThinking || !board) return;
    if (mode === "ai" && currentColor !== playerColor) return;

    if (gameType === "go") {
      const r = tryPlaceStone(board, x, y, currentColor, boardSize, koPoint);
      if (!r) return;
      setHistory(h => [...h, snap()]);
      setBoard(r.board); setKoPoint(r.koPoint); setLastMove({x,y});
      setMoveNum(m=>m+1); setPassCount(0);
      if (currentColor===BLACK) setBlackCap(c=>c+r.captured); else setWhiteCap(c=>c+r.captured);
      setCurrentColor(3-currentColor);
    } else {
      if (board[y][x] !== EMPTY) return;
      const nb = copyBoard(board);
      nb[y][x] = currentColor;
      setHistory(h => [...h, snap()]);
      setBoard(nb); setLastMove({x,y}); setMoveNum(m=>m+1);
      if (checkWinAt(nb, x, y, boardSize)) {
        setWinner(currentColor); setWinLine(findWinLine(nb,x,y,boardSize)); setGameOver(true);
      } else {
        let full = true;
        outer: for (let i=0;i<boardSize;i++) for (let j=0;j<boardSize;j++) if (nb[i][j]===EMPTY) { full=false; break outer; }
        if (full) { setWinner(0); setGameOver(true); }
        else setCurrentColor(3-currentColor);
      }
    }
  }, [board, currentColor, boardSize, koPoint, gameOver, aiThinking, mode, playerColor, gameType, blackCap, whiteCap, lastMove, passCount, moveNum]);

  // ── Pass ──
  const handlePass = useCallback(() => {
    if (gameType!=="go"||gameOver||aiThinking) return;
    if (mode==="ai"&&currentColor!==playerColor) return;
    setHistory(h=>[...h, snap()]); setMoveNum(m=>m+1);
    const np = passCount+1;
    if (np>=2) {
      const t = calculateTerritory(board, boardSize);
      setTerrMap(t.territory);
      setScores({ black:t.blackScore, white:t.whiteScore+KOMI, bT:t.blackTerritory, wT:t.whiteTerritory, bS:t.blackStones, wS:t.whiteStones });
      setGameOver(true);
    } else { setPassCount(np); setCurrentColor(3-currentColor); setKoPoint(null); setLastMove(null); }
  }, [board, currentColor, boardSize, passCount, gameOver, aiThinking, mode, playerColor, gameType, koPoint, blackCap, whiteCap, lastMove, moveNum]);

  // ── Undo ──
  const handleUndo = useCallback(() => {
    if (!history.length||aiThinking) return;
    const steps = mode==="ai"&&history.length>=2 ? 2 : 1;
    const t = history[history.length-steps];
    setBoard(t.board); setCurrentColor(t.currentColor); setKoPoint(t.koPoint);
    setBlackCap(t.blackCap); setWhiteCap(t.whiteCap);
    setLastMove(t.lastMove); setPassCount(t.passCount); setMoveNum(t.moveNum);
    setHistory(h=>h.slice(0,h.length-steps));
    setGameOver(false); setScores(null); setTerrMap(null); setWinner(null); setWinLine(null);
  }, [history, aiThinking, mode]);

  // ── Resign ──
  const handleResign = useCallback(() => {
    if (gameOver||aiThinking) return;
    if (gameType==="go") {
      const t = calculateTerritory(board, boardSize);
      setTerrMap(t.territory);
      setScores({ resigned:true, winnerName: currentColor===BLACK?"백":"흑" });
    } else { setWinner(3-currentColor); }
    setGameOver(true);
  }, [board, boardSize, currentColor, gameOver, aiThinking, gameType]);

  // ── AI ──
  useEffect(() => {
    if (mode!=="ai"||currentColor===playerColor||gameOver||!board||aiThinking) return;
    setAiThinking(true);
    const timer = setTimeout(() => {
      if (gameType==="go") {
        const sims = getGoSims(difficulty, boardSize);
        const move = goAiSelectMove(board, currentColor, boardSize, sims, koPoint);
        if (!move) {
          setHistory(h=>[...h, snap()]); setMoveNum(m=>m+1);
          const np = passCount+1;
          if (np>=2) {
            const t = calculateTerritory(board, boardSize);
            setTerrMap(t.territory);
            setScores({ black:t.blackScore, white:t.whiteScore+KOMI, bT:t.blackTerritory, wT:t.whiteTerritory, bS:t.blackStones, wS:t.whiteStones });
            setGameOver(true);
          } else { setPassCount(np); setCurrentColor(3-currentColor); setKoPoint(null); setLastMove(null); }
        } else {
          const r = tryPlaceStone(board,move.x,move.y,currentColor,boardSize,koPoint);
          if (r) {
            setHistory(h=>[...h, snap()]);
            setBoard(r.board); setKoPoint(r.koPoint); setLastMove({x:move.x,y:move.y});
            setMoveNum(m=>m+1); setPassCount(0);
            if (currentColor===BLACK) setBlackCap(c=>c+r.captured); else setWhiteCap(c=>c+r.captured);
            setCurrentColor(3-currentColor);
          }
        }
      } else {
        const bc = board.map(r=>[...r]);
        const move = gomokuAiMove(bc, currentColor, boardSize, difficulty);
        if (move) {
          const nb = copyBoard(board);
          nb[move.y][move.x] = currentColor;
          setHistory(h=>[...h, snap()]);
          setBoard(nb); setLastMove({x:move.x,y:move.y}); setMoveNum(m=>m+1);
          if (checkWinAt(nb,move.x,move.y,boardSize)) { setWinner(currentColor); setWinLine(findWinLine(nb,move.x,move.y,boardSize)); setGameOver(true); }
          else setCurrentColor(3-currentColor);
        }
      }
      setAiThinking(false);
    }, 80);
    return () => clearTimeout(timer);
  }, [mode, currentColor, playerColor, gameOver, board, aiThinking, difficulty, boardSize, koPoint, passCount, gameType]);

  // ── Board geometry ──
  const cellSize = boardSize >= 19 ? 22 : boardSize >= 15 ? 28 : boardSize >= 13 ? 30 : 38;
  const pad = cellSize * 1.2;
  const svgW = cellSize*(boardSize-1)+pad*2;
  const stars = getStarPoints(boardSize);
  const tx = x => pad+x*cellSize;
  const ty = y => pad+y*cellSize;

  const onBoardClick = (e) => {
    const svg = e.currentTarget, pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const sp = pt.matrixTransform(svg.getScreenCTM().inverse());
    const x = Math.round((sp.x-pad)/cellSize), y = Math.round((sp.y-pad)/cellSize);
    if (x>=0&&x<boardSize&&y>=0&&y<boardSize) placeStone(x,y);
  };

  const onBoardMove = (e) => {
    if (gameOver||aiThinking) { setHover(null); return; }
    const svg = e.currentTarget, pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const sp = pt.matrixTransform(svg.getScreenCTM().inverse());
    const x = Math.round((sp.x-pad)/cellSize), y = Math.round((sp.y-pad)/cellSize);
    if (x>=0&&x<boardSize&&y>=0&&y<boardSize&&board&&board[y][x]===EMPTY) setHover({x,y}); else setHover(null);
  };

  // ══════════════════════════════════════════
  //  HOME SCREEN
  // ══════════════════════════════════════════
  if (screen === "home") {
    return (
      <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:`linear-gradient(145deg, ${C.bg} 0%, #2d2419 50%, ${C.bg} 100%)`, fontFamily:FONT, padding:20, gap:16 }}>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;600;700&display=swap" rel="stylesheet" />
        <h1 style={{ fontSize:36, color:C.t1, margin:0, letterSpacing:6, fontWeight:700 }}>BADUK ARENA</h1>
        <p style={{ color:C.t5, fontSize:13, margin:"0 0 8px", letterSpacing:3 }}>바둑 · 오목</p>
        <div style={{ display:"flex", gap:16, marginTop:16, flexWrap:"wrap", justifyContent:"center" }}>
          {[
            ["go","바둑","碁","따냄 · 집 계산 · AI 대전\n전략의 깊이를 경험하세요"],
            ["gomoku","오목","五目","5개를 먼저 일렬로!\n직관과 전략의 대결"]
          ].map(([type, name, kanji, desc]) => (
            <button key={type} onClick={() => goSettings(type)} style={{
              width: 175, padding: "30px 18px", borderRadius: 14,
              border: `1px solid ${C.bdr}`, background: C.card,
              cursor: "pointer", textAlign: "center", transition: "all 0.25s",
              boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor=C.gold; e.currentTarget.style.transform="translateY(-4px)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor=C.bdr; e.currentTarget.style.transform="none"; }}
            >
              <div style={{ fontSize:38, color:C.t5, marginBottom:4 }}>{kanji}</div>
              <div style={{ fontSize:24, color:C.t1, fontWeight:700, letterSpacing:4, marginBottom:10 }}>{name}</div>
              <div style={{ fontSize:11, color:C.t4, lineHeight:1.7, whiteSpace:"pre-line" }}>{desc}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════
  //  SETTINGS SCREEN
  // ══════════════════════════════════════════
  if (screen === "settings") {
    const isGo = gameType==="go";
    const sizes = isGo ? [9,13,19] : [13,15,19];
    return (
      <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:`linear-gradient(145deg, ${C.bg} 0%, #2d2419 50%, ${C.bg} 100%)`, fontFamily:FONT, padding:20 }}>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;600;700&display=swap" rel="stylesheet" />
        <div style={{ background:`linear-gradient(135deg, ${C.card}, ${C.cardDk})`, border:`1px solid ${C.bdr}`, borderRadius:16, padding:"40px 34px", maxWidth:400, width:"90%", boxShadow:"0 24px 80px rgba(0,0,0,0.6)" }}>
          <button onClick={() => setScreen("home")} style={{ background:"none", border:"none", color:C.t4, fontFamily:FONT, fontSize:13, cursor:"pointer", marginBottom:12, padding:0 }}>← 돌아가기</button>
          <h2 style={{ textAlign:"center", fontSize:30, color:C.t1, margin:"0 0 2px", letterSpacing:6 }}>{isGo?"바둑":"오목"}</h2>
          <p style={{ textAlign:"center", color:C.t5, fontSize:12, margin:"0 0 28px", letterSpacing:2 }}>{isGo?"碁 — THE GAME OF GO":"五目 — GOMOKU"}</p>

          {[
            ["바둑판 크기", sizes.map(s => [s, `${s}×${s}`]), boardSize, setBoardSize],
            ["대국 모드", [["pvp","1:1 대국"],["ai","AI 대국"]], mode, setMode],
          ].map(([label, opts, val, setter]) => (
            <div key={label} style={{ marginBottom:20 }}>
              <label style={{ color:C.t3, fontSize:11, letterSpacing:2, display:"block", marginBottom:8, textTransform:"uppercase" }}>{label}</label>
              <div style={{ display:"flex", gap:8 }}>
                {opts.map(o => { const [v,l] = Array.isArray(o[0]) ? o : [o, Array.isArray(o)?o[1]:o]; const key = Array.isArray(o)?o[0]:o; const lbl = Array.isArray(o)?o[1]:String(o);
                  return <button key={key} onClick={() => setter(key)} style={optBtn(val===key)}>{lbl}</button>;
                })}
              </div>
            </div>
          ))}

          {mode==="ai" && (
            <>
              <div style={{ marginBottom:20 }}>
                <label style={{ color:C.t3, fontSize:11, letterSpacing:2, display:"block", marginBottom:8, textTransform:"uppercase" }}>난이도</label>
                <div style={{ display:"flex", gap:8 }}>
                  {[["easy","쉬움"],["medium","보통"],["hard","어려움"]].map(([d,l]) => <button key={d} onClick={() => setDifficulty(d)} style={optBtn(difficulty===d)}>{l}</button>)}
                </div>
              </div>
              <div style={{ marginBottom:20 }}>
                <label style={{ color:C.t3, fontSize:11, letterSpacing:2, display:"block", marginBottom:8, textTransform:"uppercase" }}>돌 색상</label>
                <div style={{ display:"flex", gap:8 }}>
                  {[[BLACK,"흑 (선공)"],[WHITE,"백 (후공)"]].map(([c,l]) => (
                    <button key={c} onClick={() => setPlayerColor(c)} style={{ ...optBtn(playerColor===c), display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                      <span style={{ width:13, height:13, borderRadius:"50%", display:"inline-block",
                        background: c===BLACK?"radial-gradient(circle at 35% 35%,#555,#111)":"radial-gradient(circle at 35% 35%,#fff,#ccc)",
                        border: c===WHITE?"1px solid #999":"none"
                      }} />{l}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <button onClick={startGame} style={{
            width:"100%", padding:14, borderRadius:10, border:"none",
            background:`linear-gradient(135deg, ${C.gold}, #a88540)`,
            color:"#1a1410", fontFamily:FONT, fontSize:18, fontWeight:700,
            cursor:"pointer", letterSpacing:2, boxShadow:"0 4px 20px rgba(180,140,70,0.3)", marginTop:4
          }}>대국 시작</button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════
  //  GAME SCREEN
  // ══════════════════════════════════════════
  const isGo = gameType==="go";

  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:`linear-gradient(145deg, ${C.bg} 0%, #2d2419 50%, ${C.bg} 100%)`, fontFamily:FONT, padding:14, gap:10, boxSizing:"border-box" }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;600;700&display=swap" rel="stylesheet" />
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>

      {/* Status */}
      <div style={{ display:"flex", alignItems:"center", gap:14, background:"rgba(40,32,24,0.9)", border:`1px solid rgba(180,150,100,0.15)`, borderRadius:12, padding:"8px 18px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <div style={{ width:15,height:15,borderRadius:"50%", background:"radial-gradient(circle at 35% 35%,#555,#111)", boxShadow:currentColor===BLACK&&!gameOver?`0 0 0 2px ${C.gold}`:"none" }} />
          <span style={{ color:C.t2, fontSize:12 }}>흑{isGo&&blackCap>0?` (+${blackCap})`:""}</span>
        </div>
        <div style={{ color:C.t4, fontSize:11, letterSpacing:1, minWidth:90, textAlign:"center" }}>
          {isGo?"바둑":"오목"} · {gameOver?"종료":aiThinking?"AI 생각 중...":`${moveNum+1}수째`}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <span style={{ color:C.t2, fontSize:12 }}>{isGo&&whiteCap>0?`(+${whiteCap}) `:""}백</span>
          <div style={{ width:15,height:15,borderRadius:"50%", background:"radial-gradient(circle at 35% 35%,#fff,#d0d0d0)", border:"1px solid #999", boxShadow:currentColor===WHITE&&!gameOver?`0 0 0 2px ${C.gold}`:"none" }} />
        </div>
      </div>

      {/* Board */}
      <div style={{ background:"linear-gradient(135deg,rgba(60,48,36,0.6),rgba(40,30,22,0.6))", borderRadius:12, padding:4, border:`1px solid rgba(180,150,100,0.1)`, boxShadow:"0 12px 40px rgba(0,0,0,0.4)" }}>
        <svg width={svgW} height={svgW} viewBox={`0 0 ${svgW} ${svgW}`}
          onClick={onBoardClick} onMouseMove={onBoardMove} onMouseLeave={()=>setHover(null)}
          style={{ display:"block", cursor:gameOver||aiThinking?"default":"pointer", maxWidth:"90vw", maxHeight:"68vh" }}>
          <defs>
            <radialGradient id="bs" cx="35%" cy="35%"><stop offset="0%" stopColor="#666"/><stop offset="50%" stopColor="#333"/><stop offset="100%" stopColor="#111"/></radialGradient>
            <radialGradient id="ws" cx="35%" cy="35%"><stop offset="0%" stopColor="#fff"/><stop offset="70%" stopColor="#eee"/><stop offset="100%" stopColor="#ccc"/></radialGradient>
            <filter id="sh"><feDropShadow dx="1" dy="1.5" stdDeviation="1.5" floodOpacity="0.4"/></filter>
            <pattern id="wg" patternUnits="userSpaceOnUse" width="200" height="200">
              {[...Array(20)].map((_,i) => <line key={i} x1="0" y1={i*10+Math.sin(i)*3} x2="200" y2={i*10+Math.cos(i)*3} stroke="rgba(120,80,20,0.15)" strokeWidth={0.5+((i*7)%3)*0.3}/>)}
            </pattern>
          </defs>
          <rect width={svgW} height={svgW} rx="8" fill="#d4a34a"/>
          <rect width={svgW} height={svgW} rx="8" fill="url(#wg)" opacity="0.3"/>

          {[...Array(boardSize)].map((_,i) => <React.Fragment key={i}>
            <line x1={tx(0)} y1={ty(i)} x2={tx(boardSize-1)} y2={ty(i)} stroke="#5a4020" strokeWidth={i===0||i===boardSize-1?1.5:0.8}/>
            <line x1={tx(i)} y1={ty(0)} x2={tx(i)} y2={ty(boardSize-1)} stroke="#5a4020" strokeWidth={i===0||i===boardSize-1?1.5:0.8}/>
          </React.Fragment>)}

          {stars.map(([sx,sy]) => <circle key={`s${sx}${sy}`} cx={tx(sx)} cy={ty(sy)} r={cellSize*0.1} fill="#5a4020"/>)}

          {/* Territory markers (Go) */}
          {isGo && gameOver && terrMap && board && board.map((row,y) => row.map((cell,x) => {
            if (cell!==EMPTY||!terrMap[y][x]) return null;
            return <rect key={`t${x}${y}`} x={tx(x)-cellSize*0.15} y={ty(y)-cellSize*0.15} width={cellSize*0.3} height={cellSize*0.3} fill={terrMap[y][x]===BLACK?"#222":"#eee"} opacity={0.7} rx={2}/>;
          }))}

          {/* Win line (Gomoku) */}
          {!isGo && winLine && winLine.length >= 5 && (
            <line x1={tx(winLine[0][0])} y1={ty(winLine[0][1])} x2={tx(winLine[winLine.length-1][0])} y2={ty(winLine[winLine.length-1][1])}
              stroke="rgba(220,60,60,0.65)" strokeWidth={cellSize*0.14} strokeLinecap="round"/>
          )}

          {/* Stones */}
          {board && board.map((row,y) => row.map((cell,x) => {
            if (cell===EMPTY) return null;
            return <circle key={`${x},${y}`} cx={tx(x)} cy={ty(y)} r={cellSize*0.44}
              fill={cell===BLACK?"url(#bs)":"url(#ws)"} stroke={cell===WHITE?"#aaa":"none"} strokeWidth={cell===WHITE?0.5:0} filter="url(#sh)"/>;
          }))}

          {lastMove && board && board[lastMove.y]?.[lastMove.x]!==EMPTY && (
            <circle cx={tx(lastMove.x)} cy={ty(lastMove.y)} r={cellSize*0.12} fill="none" stroke={C.gold} strokeWidth={2}/>
          )}

          {hover && !gameOver && !aiThinking && (
            <circle cx={tx(hover.x)} cy={ty(hover.y)} r={cellSize*0.38}
              fill={currentColor===BLACK?"rgba(0,0,0,0.3)":"rgba(255,255,255,0.4)"} style={{pointerEvents:"none"}}/>
          )}
        </svg>
      </div>

      {/* Score panel */}
      {gameOver && (
        <div style={{ background:"rgba(40,32,24,0.95)", border:`1px solid ${C.bdr}`, borderRadius:12, padding:"14px 24px", textAlign:"center", maxWidth:"90vw" }}>
          {isGo && scores && (scores.resigned
            ? <div style={{ color:C.t1, fontSize:18, fontWeight:700 }}>{scores.winnerName} 승 (기권)</div>
            : <>
                <div style={{ color:C.t1, fontSize:18, fontWeight:700, marginBottom:8 }}>{scores.black>scores.white?"흑 승":"백 승"}</div>
                <div style={{ display:"flex", gap:28, justifyContent:"center", color:C.t3, fontSize:12 }}>
                  <div><div style={{ fontWeight:700, fontSize:20, color:C.t2 }}>{scores.black.toFixed(1)}</div>흑 (집 {scores.bT} + 돌 {scores.bS})</div>
                  <div style={{ color:"#5a4a38", fontSize:18, alignSelf:"center" }}>vs</div>
                  <div><div style={{ fontWeight:700, fontSize:20, color:C.t2 }}>{scores.white.toFixed(1)}</div>백 (집 {scores.wT} + 돌 {scores.wS} + 덤 {KOMI})</div>
                </div>
              </>
          )}
          {!isGo && (
            <div style={{ color:C.t1, fontSize:20, fontWeight:700 }}>
              {winner===0 ? "무승부" : winner===BLACK ? "흑 승!" : "백 승!"}
              {winner && winner!==0 && !scores?.resigned && <span style={{ fontSize:13, fontWeight:400, color:C.t4, marginLeft:8 }}>({moveNum}수 만에)</span>}
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", justifyContent:"center" }}>
        {!gameOver && <>
          {isGo && <button onClick={handlePass} disabled={aiThinking} style={gameBtn}>패스</button>}
          <button onClick={handleUndo} disabled={aiThinking||!history.length} style={gameBtn}>무르기</button>
          <button onClick={handleResign} disabled={aiThinking} style={gameBtn}>기권</button>
        </>}
        {gameOver && <button onClick={startGame} style={{...gameBtn, background:C.goldDim}}>다시 시작</button>}
        <button onClick={()=>setScreen("settings")} style={gameBtn}>설정</button>
        <button onClick={()=>{ setScreen("home"); setBoard(null); setGameOver(false); }} style={gameBtn}>홈</button>
      </div>

      {aiThinking && <div style={{ color:C.gold, fontSize:13, animation:"pulse 1.5s ease-in-out infinite" }}>AI가 수를 계산하고 있습니다...</div>}
    </div>
  );
}
