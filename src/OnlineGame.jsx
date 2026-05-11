import { useEffect, useState, useMemo, useCallback } from 'react';
import { doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db, ensureSignedIn } from './firebase';
import {
  EMPTY, BLACK, WHITE, KOMI,
  copyBoard, makeBoard,
  serializeBoard, deserializeBoard,
  tryPlaceStone, calculateTerritory,
  checkWinAt, findWinLine,
} from './gameLogic';
import { C, FONT, FONT_LINK_HREF, PAGE_BG, gameBtn } from './styles';
import BoardView from './BoardView';

// `room` prop is { code: string, myColor: 1 | 2 } from OnlineLobby.
export default function OnlineGame({ room, onLeave }) {
  const [state, setState] = useState(null);   // Firestore doc data
  const [uid, setUid] = useState(null);
  const [err, setErr] = useState('');
  const [hover, setHover] = useState(null);
  const [terrMap, setTerrMap] = useState(null);
  const [copied, setCopied] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  // ── Auth + subscribe ──
  useEffect(() => {
    let unsub;
    ensureSignedIn().then(user => {
      setUid(user.uid);
      unsub = onSnapshot(
        doc(db, 'rooms', room.code),
        snap => {
          if (!snap.exists()) { setErr('방이 사라졌습니다.'); return; }
          setState(snap.data());
        },
        e => setErr(`연결 오류: ${e.message}`)
      );
    }).catch(e => setErr(`로그인 실패: ${e.message}`));
    return () => unsub?.();
  }, [room.code]);

  // ── Derive board + territory ──
  const board = useMemo(() => {
    if (!state) return null;
    return deserializeBoard(state.board, state.boardSize);
  }, [state]);

  // Recompute territory whenever game ends.
  useEffect(() => {
    if (state?.gameType === 'go' && state?.gameOver && state?.terrMap === 'computed' && board) {
      const t = calculateTerritory(board, state.boardSize);
      setTerrMap(t.territory);
    } else {
      setTerrMap(null);
    }
  }, [state?.gameOver, state?.terrMap, state?.boardSize, state?.gameType, board]);

  // Determine my color: prefer prop, but fall back to uid match (covers refresh).
  const myColor = useMemo(() => {
    if (!state || !uid) return room.myColor;
    if (state.players?.black?.uid === uid) return BLACK;
    if (state.players?.white?.uid === uid) return WHITE;
    return null; // Spectator (shouldn't happen in normal flow)
  }, [state, uid, room.myColor]);

  const isMyTurn = state && !state.gameOver && state.currentColor === myColor && state.players?.white;
  const waitingForOpponent = state && !state.players?.white;
  const isGo = state?.gameType === 'go';

  // ── Transactional move handler ─────────────────────
  // Re-reads doc inside transaction so simultaneous opponent moves can't be lost.
  const playMove = useCallback(async (action) => {
    if (!state || !uid) return;
    try {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, 'rooms', room.code);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error('Room missing');
        const cur = snap.data();
        if (cur.gameOver) throw new Error('Game already over');
        if (cur.currentColor !== myColor) throw new Error('Not your turn');
        if (!cur.players?.white) throw new Error('Waiting for opponent');

        const curBoard = deserializeBoard(cur.board, cur.boardSize);
        const result = action(curBoard, cur);
        if (!result) throw new Error('Illegal move');

        tx.update(ref, { ...result, updatedAt: serverTimestamp() });
      });
    } catch (e) {
      console.warn('Move rejected:', e.message);
      // Silent for benign cases (not your turn, etc); only flash on unexpected errors
      if (!/Not your turn|Illegal|Waiting|Game already/.test(e.message)) {
        setErr(`착수 실패: ${e.message}`);
      }
    }
  }, [state, uid, myColor, room.code]);

  // ── Stone placement ──
  const placeStone = useCallback((x, y) => {
    if (!isMyTurn) return;

    playMove((curBoard, cur) => {
      if (isGo) {
        const r = tryPlaceStone(curBoard, x, y, cur.currentColor, cur.boardSize, cur.koPoint);
        if (!r) return null;
        const nextCap = cur.currentColor === BLACK
          ? { blackCap: cur.blackCap + r.captured }
          : { whiteCap: cur.whiteCap + r.captured };
        return {
          board: serializeBoard(r.board),
          koPoint: r.koPoint,
          lastMove: { x, y },
          currentColor: 3 - cur.currentColor,
          passCount: 0,
          moveNum: cur.moveNum + 1,
          ...nextCap,
        };
      }
      // Gomoku
      if (curBoard[y][x] !== EMPTY) return null;
      const nb = copyBoard(curBoard);
      nb[y][x] = cur.currentColor;
      const win = checkWinAt(nb, x, y, cur.boardSize);
      const winLine = win ? findWinLine(nb, x, y, cur.boardSize) : null;
      let full = true;
      outer: for (let i = 0; i < cur.boardSize; i++)
        for (let j = 0; j < cur.boardSize; j++)
          if (nb[i][j] === EMPTY) { full = false; break outer; }
      return {
        board: serializeBoard(nb),
        lastMove: { x, y },
        moveNum: cur.moveNum + 1,
        ...(win
          ? { gameOver: true, winner: cur.currentColor, winLine, status: 'ended' }
          : full
            ? { gameOver: true, winner: 0, status: 'ended' }
            : { currentColor: 3 - cur.currentColor }),
      };
    });
  }, [isMyTurn, isGo, playMove]);

  // ── Pass (Go) ──
  const handlePass = useCallback(() => {
    if (!isMyTurn || !isGo) return;
    playMove((curBoard, cur) => {
      const np = cur.passCount + 1;
      if (np >= 2) {
        const t = calculateTerritory(curBoard, cur.boardSize);
        return {
          passCount: np,
          moveNum: cur.moveNum + 1,
          gameOver: true,
          status: 'ended',
          terrMap: 'computed',
          scores: {
            black: t.blackScore,
            white: t.whiteScore + KOMI,
            bT: t.blackTerritory, wT: t.whiteTerritory,
            bS: t.blackStones, wS: t.whiteStones,
          },
          winner: t.blackScore > t.whiteScore + KOMI ? BLACK : WHITE,
        };
      }
      return {
        passCount: np,
        moveNum: cur.moveNum + 1,
        currentColor: 3 - cur.currentColor,
        koPoint: null,
        lastMove: null,
      };
    });
  }, [isMyTurn, isGo, playMove]);

  // ── Resign ──
  const handleResign = useCallback(() => {
    if (!state || state.gameOver) return;
    if (!myColor) return;
    if (!confirm('정말 기권하시겠습니까?')) return;

    playMove((curBoard, cur) => {
      if (isGo) {
        const t = calculateTerritory(curBoard, cur.boardSize);
        return {
          gameOver: true,
          status: 'ended',
          terrMap: 'computed',
          resignedBy: myColor,
          winner: 3 - myColor,
          scores: { resigned: true, winnerName: myColor === BLACK ? '백' : '흑' },
          // Don't require turn for resignation — we manually allow it below
        };
      }
      return {
        gameOver: true,
        status: 'ended',
        resignedBy: myColor,
        winner: 3 - myColor,
      };
    });
  }, [state, myColor, isGo, playMove]);

  // Resign bypasses the turn check inside playMove. Use a direct transaction:
  const resignDirect = useCallback(async () => {
    if (!state || state.gameOver || !myColor || !uid) return;
    if (!confirm('정말 기권하시겠습니까?')) return;
    try {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, 'rooms', room.code);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error('Room missing');
        const cur = snap.data();
        if (cur.gameOver) return;
        const curBoard = deserializeBoard(cur.board, cur.boardSize);
        const updates = {
          gameOver: true,
          status: 'ended',
          resignedBy: myColor,
          winner: 3 - myColor,
          updatedAt: serverTimestamp(),
        };
        if (cur.gameType === 'go') {
          const t = calculateTerritory(curBoard, cur.boardSize);
          updates.terrMap = 'computed';
          updates.scores = { resigned: true, winnerName: myColor === BLACK ? '백' : '흑' };
        }
        tx.update(ref, updates);
      });
    } catch (e) {
      setErr(`기권 실패: ${e.message}`);
    }
  }, [state, myColor, uid, room.code]);

  const copyCode = () => {
    navigator.clipboard?.writeText(room.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // ── Render ─────────────────────────────────────────
  if (err) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: PAGE_BG, fontFamily: FONT, padding: 20 }}>
        <link href={FONT_LINK_HREF} rel="stylesheet" />
        <div style={{ background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 12, padding: 30, maxWidth: 400, textAlign: 'center' }}>
          <div style={{ color: '#ffb0b0', fontSize: 16, marginBottom: 16 }}>⚠ {err}</div>
          <button onClick={onLeave} style={{ ...gameBtn, padding: '10px 24px' }}>홈으로</button>
        </div>
      </div>
    );
  }

  if (!state || !board) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: PAGE_BG, fontFamily: FONT, color: C.t3 }}>
        <link href={FONT_LINK_HREF} rel="stylesheet" />
        연결 중...
      </div>
    );
  }

  const turnLabel = state.gameOver
    ? '대국 종료'
    : waitingForOpponent
      ? '상대방 기다리는 중'
      : isMyTurn
        ? '내 차례'
        : '상대방 차례';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: PAGE_BG, fontFamily: FONT, padding: 14, gap: 10, boxSizing: 'border-box' }}>
      <link href={FONT_LINK_HREF} rel="stylesheet" />

      {/* Room info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(40,32,24,0.9)', border: '1px solid rgba(180,150,100,0.15)', borderRadius: 10, padding: '6px 14px' }}>
        <span style={{ color: C.t4, fontSize: 11, letterSpacing: 2 }}>ROOM</span>
        <button onClick={copyCode} title="클릭하여 복사" style={{
          background: 'transparent', border: 'none',
          color: C.gold, fontSize: 18, fontWeight: 700, letterSpacing: 4,
          cursor: 'pointer', fontFamily: FONT, padding: 0,
        }}>{room.code}</button>
        {copied && <span style={{ color: C.t5, fontSize: 11 }}>복사됨</span>}
        <span style={{ width: 1, height: 18, background: C.bdr }} />
        <span style={{
          color: myColor === BLACK ? '#fff' : myColor === WHITE ? '#bbb' : C.t4,
          fontSize: 11, letterSpacing: 1,
        }}>
          나: {myColor === BLACK ? '흑' : myColor === WHITE ? '백' : '관전'}
        </span>
      </div>

      {/* Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(40,32,24,0.9)', border: '1px solid rgba(180,150,100,0.15)', borderRadius: 12, padding: '8px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 15, height: 15, borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 35%,#555,#111)',
            boxShadow: state.currentColor === BLACK && !state.gameOver ? `0 0 0 2px ${C.gold}` : 'none',
          }} />
          <span style={{ color: C.t2, fontSize: 12 }}>
            흑{isGo && state.blackCap > 0 ? ` (+${state.blackCap})` : ''}
            {!state.players?.black && <span style={{ color: C.t4 }}> (대기)</span>}
          </span>
        </div>
        <div style={{ color: isMyTurn ? C.gold : C.t4, fontSize: 11, letterSpacing: 1, minWidth: 110, textAlign: 'center', fontWeight: isMyTurn ? 700 : 400 }}>
          {turnLabel}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: C.t2, fontSize: 12 }}>
            {!state.players?.white && <span style={{ color: C.t4 }}>(대기) </span>}
            {isGo && state.whiteCap > 0 ? `(+${state.whiteCap}) ` : ''}백
          </span>
          <div style={{
            width: 15, height: 15, borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 35%,#fff,#d0d0d0)', border: '1px solid #999',
            boxShadow: state.currentColor === WHITE && !state.gameOver ? `0 0 0 2px ${C.gold}` : 'none',
          }} />
        </div>
      </div>

      <BoardView
        board={board}
        size={state.boardSize}
        gameType={state.gameType}
        lastMove={state.lastMove}
        hover={hover}
        currentColor={state.currentColor}
        terrMap={terrMap}
        winLine={state.winLine}
        onClick={placeStone}
        onHover={isMyTurn ? setHover : undefined}
        onLeave={() => setHover(null)}
        disabled={!isMyTurn}
      />

      {/* Score / result */}
      {state.gameOver && (
        <div style={{ background: 'rgba(40,32,24,0.95)', border: `1px solid ${C.bdr}`, borderRadius: 12, padding: '14px 24px', textAlign: 'center', maxWidth: '90vw' }}>
          {isGo && state.scores && (state.scores.resigned
            ? <div style={{ color: C.t1, fontSize: 18, fontWeight: 700 }}>{state.scores.winnerName} 승 (기권)</div>
            : <>
                <div style={{ color: C.t1, fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                  {state.scores.black > state.scores.white ? '흑 승' : '백 승'}
                </div>
                <div style={{ display: 'flex', gap: 28, justifyContent: 'center', color: C.t3, fontSize: 12 }}>
                  <div><div style={{ fontWeight: 700, fontSize: 20, color: C.t2 }}>{state.scores.black.toFixed(1)}</div>흑 (집 {state.scores.bT} + 돌 {state.scores.bS})</div>
                  <div style={{ color: '#5a4a38', fontSize: 18, alignSelf: 'center' }}>vs</div>
                  <div><div style={{ fontWeight: 700, fontSize: 20, color: C.t2 }}>{state.scores.white.toFixed(1)}</div>백 (집 {state.scores.wT} + 돌 {state.scores.wS} + 덤 {KOMI})</div>
                </div>
              </>
          )}
          {!isGo && (
            <div style={{ color: C.t1, fontSize: 20, fontWeight: 700 }}>
              {state.winner === 0 ? '무승부' : state.winner === BLACK ? '흑 승!' : '백 승!'}
              {state.resignedBy && <span style={{ fontSize: 13, fontWeight: 400, color: C.t4, marginLeft: 8 }}>(기권)</span>}
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {!state.gameOver && isGo && isMyTurn && (
          <button onClick={handlePass} style={gameBtn}>패스</button>
        )}
        {!state.gameOver && myColor && (
          <button onClick={resignDirect} style={gameBtn}>기권</button>
        )}
        <button onClick={() => {
          if (confirmLeave) onLeave();
          else { setConfirmLeave(true); setTimeout(() => setConfirmLeave(false), 2500); }
        }} style={{ ...gameBtn, background: confirmLeave ? 'rgba(180,60,60,0.4)' : gameBtn.background }}>
          {confirmLeave ? '한 번 더 눌러 나가기' : '나가기'}
        </button>
      </div>

      {waitingForOpponent && (
        <div style={{ color: C.gold, fontSize: 13, marginTop: 4, textAlign: 'center', maxWidth: 320 }}>
          <div style={{ animation: 'pulse 1.5s ease-in-out infinite', marginBottom: 4 }}>상대방을 기다리고 있습니다...</div>
          <div style={{ color: C.t5, fontSize: 11 }}>코드 <strong style={{ color: C.gold }}>{room.code}</strong>을(를) 상대에게 알려주세요.</div>
        </div>
      )}
    </div>
  );
}
