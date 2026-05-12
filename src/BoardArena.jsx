import React, { useState, useCallback, useEffect } from 'react';
import {
  EMPTY, BLACK, WHITE, KOMI,
  copyBoard, makeBoard,
  tryPlaceStone, calculateTerritory, goAiSelectMove, getGoSims,
  checkWinAt, findWinLine, gomokuAiMove,
} from './gameLogic';
import { C, FONT, FONT_LINK_HREF, PAGE_BG, optBtn, gameBtn, primaryBtn } from './styles';
import BoardView from './BoardView';
import OnlineLobby from './OnlineLobby';
import OnlineGame from './OnlineGame';

export default function BoardArena() {
  const [screen, setScreen] = useState('home');
  const [gameType, setGameType] = useState(null);

  const [boardSize, setBoardSize] = useState(9);
  const [mode, setMode] = useState('pvp');
  const [difficulty, setDifficulty] = useState('medium');
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
  const [aiLossStreak, setAiLossStreak] = useState(0);
  const [aiResigned, setAiResigned] = useState(false);

  // Online mode state (room joined in lobby, passed to OnlineGame)
  const [onlineRoom, setOnlineRoom] = useState(null);

  const goSettings = (type) => {
    setGameType(type);
    setBoardSize(type === 'go' ? 9 : 15);
    setMode('pvp'); setDifficulty('medium'); setPlayerColor(BLACK);
    setScreen('settings');
  };

  const startGame = () => {
    setBoard(makeBoard(boardSize));
    setCurrentColor(BLACK); setKoPoint(null); setLastMove(null);
    setBlackCap(0); setWhiteCap(0); setHistory([]); setPassCount(0);
    setGameOver(false); setScores(null); setTerrMap(null);
    setAiThinking(false); setMoveNum(0); setWinner(null); setWinLine(null);
    setAiLossStreak(0); setAiResigned(false);
    setScreen('game');
  };

  const snap = () => ({ board: copyBoard(board), currentColor, koPoint, blackCap, whiteCap, lastMove, passCount, moveNum });

  // ── Place stone ──
  const placeStone = useCallback((x, y) => {
    if (gameOver || aiThinking || !board) return;
    if (mode === 'ai' && currentColor !== playerColor) return;

    if (gameType === 'go') {
      const r = tryPlaceStone(board, x, y, currentColor, boardSize, koPoint);
      if (!r) return;
      setHistory(h => [...h, snap()]);
      setBoard(r.board); setKoPoint(r.koPoint); setLastMove({ x, y });
      setMoveNum(m => m + 1); setPassCount(0);
      if (currentColor === BLACK) setBlackCap(c => c + r.captured); else setWhiteCap(c => c + r.captured);
      setCurrentColor(3 - currentColor);
    } else {
      if (board[y][x] !== EMPTY) return;
      const nb = copyBoard(board);
      nb[y][x] = currentColor;
      setHistory(h => [...h, snap()]);
      setBoard(nb); setLastMove({ x, y }); setMoveNum(m => m + 1);
      if (checkWinAt(nb, x, y, boardSize)) {
        setWinner(currentColor); setWinLine(findWinLine(nb, x, y, boardSize)); setGameOver(true);
      } else {
        let full = true;
        outer: for (let i = 0; i < boardSize; i++) for (let j = 0; j < boardSize; j++) if (nb[i][j] === EMPTY) { full = false; break outer; }
        if (full) { setWinner(0); setGameOver(true); }
        else setCurrentColor(3 - currentColor);
      }
    }
  }, [board, currentColor, boardSize, koPoint, gameOver, aiThinking, mode, playerColor, gameType, blackCap, whiteCap, lastMove, passCount, moveNum]);

  // ── Pass ──
  const handlePass = useCallback(() => {
    if (gameType !== 'go' || gameOver || aiThinking) return;
    if (mode === 'ai' && currentColor !== playerColor) return;
    setHistory(h => [...h, snap()]); setMoveNum(m => m + 1);
    const np = passCount + 1;
    if (np >= 2) {
      const t = calculateTerritory(board, boardSize);
      setTerrMap(t.territory);
      setScores({ black: t.blackScore, white: t.whiteScore + KOMI, bT: t.blackTerritory, wT: t.whiteTerritory, bS: t.blackStones, wS: t.whiteStones });
      setGameOver(true);
    } else { setPassCount(np); setCurrentColor(3 - currentColor); setKoPoint(null); setLastMove(null); }
  }, [board, currentColor, boardSize, passCount, gameOver, aiThinking, mode, playerColor, gameType, koPoint, blackCap, whiteCap, lastMove, moveNum]);

  // ── Undo ──
  const handleUndo = useCallback(() => {
    if (!history.length || aiThinking) return;
    const steps = mode === 'ai' && history.length >= 2 ? 2 : 1;
    const t = history[history.length - steps];
    setBoard(t.board); setCurrentColor(t.currentColor); setKoPoint(t.koPoint);
    setBlackCap(t.blackCap); setWhiteCap(t.whiteCap);
    setLastMove(t.lastMove); setPassCount(t.passCount); setMoveNum(t.moveNum);
    setHistory(h => h.slice(0, h.length - steps));
    setGameOver(false); setScores(null); setTerrMap(null); setWinner(null); setWinLine(null);
    setAiResigned(false); setAiLossStreak(0);
  }, [history, aiThinking, mode]);

  // ── Resign ──
  const handleResign = useCallback(() => {
    if (gameOver || aiThinking) return;
    if (gameType === 'go') {
      const t = calculateTerritory(board, boardSize);
      setTerrMap(t.territory);
      setScores({ resigned: true, winnerName: currentColor === BLACK ? '백' : '흑' });
    } else {
      setWinner(3 - currentColor);
    }
    setGameOver(true);
  }, [board, boardSize, currentColor, gameOver, aiThinking, gameType]);

  // ── AI ──
  useEffect(() => {
    if (mode !== 'ai' || currentColor === playerColor || gameOver || !board || aiThinking) return;
    setAiThinking(true);
    const timer = setTimeout(() => {
      if (gameType === 'go') {
        const sims = getGoSims(difficulty, boardSize);
        const move = goAiSelectMove(board, currentColor, boardSize, sims, koPoint);
        if (!move) {
          setHistory(h => [...h, snap()]); setMoveNum(m => m + 1);
          const np = passCount + 1;
          if (np >= 2) {
            const t = calculateTerritory(board, boardSize);
            setTerrMap(t.territory);
            setScores({ black: t.blackScore, white: t.whiteScore + KOMI, bT: t.blackTerritory, wT: t.whiteTerritory, bS: t.blackStones, wS: t.whiteStones });
            setGameOver(true);
          } else { setPassCount(np); setCurrentColor(3 - currentColor); setKoPoint(null); setLastMove(null); }
        } else {
          // Resignation check: only after mid-game so MCTS estimates are stable.
          const enoughMoves = moveNum > Math.floor(boardSize * boardSize / 4);
          const losing = enoughMoves && move.winRate < 0.10;
          const newStreak = losing ? aiLossStreak + 1 : 0;
          if (newStreak >= 2) {
            const t = calculateTerritory(board, boardSize);
            setTerrMap(t.territory);
            setScores({ resigned: true, winnerName: playerColor === BLACK ? '흑' : '백', aiResigned: true });
            setAiResigned(true); setGameOver(true); setAiThinking(false);
            return;
          }
          setAiLossStreak(newStreak);
          const r = tryPlaceStone(board, move.x, move.y, currentColor, boardSize, koPoint);
          if (r) {
            setHistory(h => [...h, snap()]);
            setBoard(r.board); setKoPoint(r.koPoint); setLastMove({ x: move.x, y: move.y });
            setMoveNum(m => m + 1); setPassCount(0);
            if (currentColor === BLACK) setBlackCap(c => c + r.captured); else setWhiteCap(c => c + r.captured);
            setCurrentColor(3 - currentColor);
          }
        }
      } else {
        const bc = board.map(r => [...r]);
        const move = gomokuAiMove(bc, currentColor, boardSize, difficulty);
        if (move) {
          // Resignation check: opponent has an unblockable threat (eval ~ -80000 for open four).
          const losing = move.evalScore < -50000;
          const newStreak = losing ? aiLossStreak + 1 : 0;
          if (newStreak >= 2) {
            setWinner(playerColor); setAiResigned(true); setGameOver(true); setAiThinking(false);
            return;
          }
          setAiLossStreak(newStreak);
          const nb = copyBoard(board);
          nb[move.y][move.x] = currentColor;
          setHistory(h => [...h, snap()]);
          setBoard(nb); setLastMove({ x: move.x, y: move.y }); setMoveNum(m => m + 1);
          if (checkWinAt(nb, move.x, move.y, boardSize)) {
            setWinner(currentColor); setWinLine(findWinLine(nb, move.x, move.y, boardSize)); setGameOver(true);
          } else setCurrentColor(3 - currentColor);
        }
      }
      setAiThinking(false);
    }, 80);
    return () => clearTimeout(timer);
    // aiThinking은 deps에서 제외: setAiThinking(true)로 effect가 재실행될 때
    // 이전 effect의 cleanup이 호출되어 timer가 취소되는 레이스를 막는다.
    // 내부 가드(aiThinking 체크)가 중복 실행을 방지함.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, currentColor, playerColor, gameOver, board, difficulty, boardSize, koPoint, passCount, gameType]);

  // ══════════════════════════════════════════
  //  ONLINE FLOW
  // ══════════════════════════════════════════
  if (screen === 'online-lobby') {
    return <OnlineLobby
      onBack={() => setScreen('home')}
      onJoin={(room) => { setOnlineRoom(room); setScreen('online-game'); }}
    />;
  }

  if (screen === 'online-game' && onlineRoom) {
    return <OnlineGame
      room={onlineRoom}
      onLeave={() => { setOnlineRoom(null); setScreen('home'); }}
    />;
  }

  // ══════════════════════════════════════════
  //  HOME SCREEN
  // ══════════════════════════════════════════
  if (screen === 'home') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: PAGE_BG, fontFamily: FONT, padding: 20, gap: 16 }}>
        <link href={FONT_LINK_HREF} rel="stylesheet" />
        <h1 style={{ fontSize: 36, color: C.t1, margin: 0, letterSpacing: 6, fontWeight: 700 }}>BADUK ARENA</h1>
        <p style={{ color: C.t5, fontSize: 13, margin: '0 0 8px', letterSpacing: 3 }}>바둑 · 오목</p>

        <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
          {[
            ['go', '바둑', '碁', '따냄 · 집 계산 · AI 대전\n전략의 깊이를 경험하세요'],
            ['gomoku', '오목', '五目', '5개를 먼저 일렬로!\n직관과 전략의 대결'],
          ].map(([type, name, kanji, desc]) => (
            <button key={type} onClick={() => goSettings(type)} style={{
              width: 175, padding: '30px 18px', borderRadius: 14,
              border: `1px solid ${C.bdr}`, background: C.card,
              cursor: 'pointer', textAlign: 'center', transition: 'all 0.25s',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.gold; e.currentTarget.style.transform = 'translateY(-4px)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.bdr; e.currentTarget.style.transform = 'none'; }}>
              <div style={{ fontSize: 38, color: C.t5, marginBottom: 4 }}>{kanji}</div>
              <div style={{ fontSize: 24, color: C.t1, fontWeight: 700, letterSpacing: 4, marginBottom: 10 }}>{name}</div>
              <div style={{ fontSize: 11, color: C.t4, lineHeight: 1.7, whiteSpace: 'pre-line' }}>{desc}</div>
            </button>
          ))}
        </div>

        <button onClick={() => setScreen('online-lobby')} style={{
          marginTop: 8, padding: '14px 32px', borderRadius: 12,
          border: `1px solid ${C.gold}`, background: C.goldDim,
          color: C.t1, fontFamily: FONT, fontSize: 15, fontWeight: 700,
          letterSpacing: 4, cursor: 'pointer', transition: 'all 0.2s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(180,140,70,0.3)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = C.goldDim; }}>
          🌐  온라인 대국 (1:1)
        </button>
        <p style={{ color: C.t5, fontSize: 11, margin: 0, letterSpacing: 1 }}>방을 만들거나 코드로 입장하세요</p>
      </div>
    );
  }

  // ══════════════════════════════════════════
  //  SETTINGS SCREEN
  // ══════════════════════════════════════════
  if (screen === 'settings') {
    const isGo = gameType === 'go';
    const sizes = isGo ? [9, 13, 19] : [13, 15, 19];
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: PAGE_BG, fontFamily: FONT, padding: 20 }}>
        <link href={FONT_LINK_HREF} rel="stylesheet" />
        <div style={{ background: `linear-gradient(135deg, ${C.card}, ${C.cardDk})`, border: `1px solid ${C.bdr}`, borderRadius: 16, padding: '40px 34px', maxWidth: 400, width: '90%', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}>
          <button onClick={() => setScreen('home')} style={{ background: 'none', border: 'none', color: C.t4, fontFamily: FONT, fontSize: 13, cursor: 'pointer', marginBottom: 12, padding: 0 }}>← 돌아가기</button>
          <h2 style={{ textAlign: 'center', fontSize: 30, color: C.t1, margin: '0 0 2px', letterSpacing: 6 }}>{isGo ? '바둑' : '오목'}</h2>
          <p style={{ textAlign: 'center', color: C.t5, fontSize: 12, margin: '0 0 28px', letterSpacing: 2 }}>{isGo ? '碁 — THE GAME OF GO' : '五目 — GOMOKU'}</p>

          <div style={{ marginBottom: 20 }}>
            <label style={{ color: C.t3, fontSize: 11, letterSpacing: 2, display: 'block', marginBottom: 8, textTransform: 'uppercase' }}>바둑판 크기</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {sizes.map(s => <button key={s} onClick={() => setBoardSize(s)} style={optBtn(boardSize === s)}>{s}×{s}</button>)}
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ color: C.t3, fontSize: 11, letterSpacing: 2, display: 'block', marginBottom: 8, textTransform: 'uppercase' }}>대국 모드</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[['pvp', '1:1 대국'], ['ai', 'AI 대국']].map(([k, l]) =>
                <button key={k} onClick={() => setMode(k)} style={optBtn(mode === k)}>{l}</button>
              )}
            </div>
          </div>

          {mode === 'ai' && (
            <>
              <div style={{ marginBottom: 20 }}>
                <label style={{ color: C.t3, fontSize: 11, letterSpacing: 2, display: 'block', marginBottom: 8, textTransform: 'uppercase' }}>난이도</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[['easy', '쉬움'], ['medium', '보통'], ['hard', '어려움']].map(([d, l]) =>
                    <button key={d} onClick={() => setDifficulty(d)} style={optBtn(difficulty === d)}>{l}</button>
                  )}
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ color: C.t3, fontSize: 11, letterSpacing: 2, display: 'block', marginBottom: 8, textTransform: 'uppercase' }}>돌 색상</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[[BLACK, '흑 (선공)'], [WHITE, '백 (후공)']].map(([c, l]) => (
                    <button key={c} onClick={() => setPlayerColor(c)} style={{ ...optBtn(playerColor === c), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <span style={{
                        width: 13, height: 13, borderRadius: '50%', display: 'inline-block',
                        background: c === BLACK ? 'radial-gradient(circle at 35% 35%,#555,#111)' : 'radial-gradient(circle at 35% 35%,#fff,#ccc)',
                        border: c === WHITE ? '1px solid #999' : 'none',
                      }} />{l}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <button onClick={startGame} style={{ ...primaryBtn, marginTop: 4 }}>대국 시작</button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════
  //  GAME SCREEN
  // ══════════════════════════════════════════
  const isGo = gameType === 'go';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: PAGE_BG, fontFamily: FONT, padding: 14, gap: 10, boxSizing: 'border-box' }}>
      <link href={FONT_LINK_HREF} rel="stylesheet" />

      {/* Status bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(40,32,24,0.9)', border: '1px solid rgba(180,150,100,0.15)', borderRadius: 12, padding: '8px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 15, height: 15, borderRadius: '50%', background: 'radial-gradient(circle at 35% 35%,#555,#111)', boxShadow: currentColor === BLACK && !gameOver ? `0 0 0 2px ${C.gold}` : 'none' }} />
          <span style={{ color: C.t2, fontSize: 12 }}>흑{isGo && blackCap > 0 ? ` (+${blackCap})` : ''}</span>
        </div>
        <div style={{ color: C.t4, fontSize: 11, letterSpacing: 1, minWidth: 90, textAlign: 'center' }}>
          {isGo ? '바둑' : '오목'} · {gameOver ? '종료' : aiThinking ? 'AI 생각 중...' : `${moveNum + 1}수째`}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: C.t2, fontSize: 12 }}>{isGo && whiteCap > 0 ? `(+${whiteCap}) ` : ''}백</span>
          <div style={{ width: 15, height: 15, borderRadius: '50%', background: 'radial-gradient(circle at 35% 35%,#fff,#d0d0d0)', border: '1px solid #999', boxShadow: currentColor === WHITE && !gameOver ? `0 0 0 2px ${C.gold}` : 'none' }} />
        </div>
      </div>

      <BoardView
        board={board}
        size={boardSize}
        gameType={gameType}
        lastMove={lastMove}
        hover={hover}
        currentColor={currentColor}
        terrMap={terrMap}
        winLine={winLine}
        onClick={placeStone}
        onHover={setHover}
        onLeave={() => setHover(null)}
        disabled={gameOver || aiThinking}
      />

      {/* Score panel */}
      {gameOver && (
        <div style={{ background: 'rgba(40,32,24,0.95)', border: `1px solid ${C.bdr}`, borderRadius: 12, padding: '14px 24px', textAlign: 'center', maxWidth: '90vw' }}>
          {isGo && scores && (scores.resigned
            ? <div style={{ color: C.t1, fontSize: 18, fontWeight: 700 }}>{scores.winnerName} 승 ({scores.aiResigned ? 'AI 기권' : '기권'})</div>
            : <>
                <div style={{ color: C.t1, fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{scores.black > scores.white ? '흑 승' : '백 승'}</div>
                <div style={{ display: 'flex', gap: 28, justifyContent: 'center', color: C.t3, fontSize: 12 }}>
                  <div><div style={{ fontWeight: 700, fontSize: 20, color: C.t2 }}>{scores.black.toFixed(1)}</div>흑 (집 {scores.bT} + 돌 {scores.bS})</div>
                  <div style={{ color: '#5a4a38', fontSize: 18, alignSelf: 'center' }}>vs</div>
                  <div><div style={{ fontWeight: 700, fontSize: 20, color: C.t2 }}>{scores.white.toFixed(1)}</div>백 (집 {scores.wT} + 돌 {scores.wS} + 덤 {KOMI})</div>
                </div>
              </>
          )}
          {!isGo && (
            <div style={{ color: C.t1, fontSize: 20, fontWeight: 700 }}>
              {winner === 0 ? '무승부' : winner === BLACK ? '흑 승!' : '백 승!'}
              {aiResigned && <span style={{ fontSize: 13, fontWeight: 400, color: C.t4, marginLeft: 8 }}>(AI 기권)</span>}
              {winner && winner !== 0 && !scores?.resigned && !aiResigned && <span style={{ fontSize: 13, fontWeight: 400, color: C.t4, marginLeft: 8 }}>({moveNum}수 만에)</span>}
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {!gameOver && <>
          {isGo && <button onClick={handlePass} disabled={aiThinking} style={gameBtn}>패스</button>}
          <button onClick={handleUndo} disabled={aiThinking || !history.length} style={gameBtn}>무르기</button>
          <button onClick={handleResign} disabled={aiThinking} style={gameBtn}>기권</button>
        </>}
        {gameOver && <button onClick={startGame} style={{ ...gameBtn, background: C.goldDim }}>다시 시작</button>}
        <button onClick={() => setScreen('settings')} style={gameBtn}>설정</button>
        <button onClick={() => { setScreen('home'); setBoard(null); setGameOver(false); }} style={gameBtn}>홈</button>
      </div>

      {aiThinking && <div style={{ color: C.gold, fontSize: 13, animation: 'pulse 1.5s ease-in-out infinite' }}>AI가 수를 계산하고 있습니다...</div>}
    </div>
  );
}
