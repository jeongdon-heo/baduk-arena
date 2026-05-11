import { useState } from 'react';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, ensureSignedIn, isFirebaseConfigured } from './firebase';
import { makeBoard, serializeBoard, BLACK } from './gameLogic';
import { C, FONT, FONT_LINK_HREF, PAGE_BG, optBtn, primaryBtn } from './styles';

// Room codes avoid ambiguous chars (0/O, 1/I/L) to make verbal sharing easy.
const CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
function randomCode(len = 6) {
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

const card = {
  background: `linear-gradient(135deg, ${C.card}, ${C.cardDk})`,
  border: `1px solid ${C.bdr}`,
  borderRadius: 16, padding: '40px 34px',
  maxWidth: 420, width: '90%',
  boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
};

export default function OnlineLobby({ onBack, onJoin }) {
  const [view, setView] = useState('choose'); // choose | create | join
  const [gameType, setGameType] = useState('go');
  const [boardSize, setBoardSize] = useState(9);
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!isFirebaseConfigured) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: PAGE_BG, fontFamily: FONT, padding: 20 }}>
        <link href={FONT_LINK_HREF} rel="stylesheet" />
        <div style={card}>
          <h2 style={{ color: C.t1, marginTop: 0, fontSize: 22, letterSpacing: 2 }}>온라인 모드 미설정</h2>
          <p style={{ color: C.t3, fontSize: 13, lineHeight: 1.7 }}>
            온라인 대국을 사용하려면 Firebase 설정이 필요합니다.<br /><br />
            <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: 4, color: C.gold }}>.env.local</code> 파일에 Firebase 자격증명을 입력한 뒤 개발 서버를 재시작하세요. (자세한 방법은 README 참고)
          </p>
          <button onClick={onBack} style={{ ...primaryBtn, marginTop: 16, background: 'rgba(180,140,70,0.2)', color: C.t1 }}>홈으로</button>
        </div>
      </div>
    );
  }

  const createRoom = async () => {
    setError(''); setBusy(true);
    try {
      const user = await ensureSignedIn();
      let code, attempts = 0;
      // Vanishingly small collision odds, but retry a few times to be safe.
      while (attempts < 5) {
        code = randomCode();
        const snap = await getDoc(doc(db, 'rooms', code));
        if (!snap.exists()) break;
        attempts++;
      }
      if (attempts >= 5) { setError('방 코드 생성 실패. 다시 시도하세요.'); setBusy(false); return; }

      const board = makeBoard(boardSize);
      await setDoc(doc(db, 'rooms', code), {
        gameType,
        boardSize,
        board: serializeBoard(board),
        currentColor: BLACK,
        koPoint: null,
        lastMove: null,
        blackCap: 0,
        whiteCap: 0,
        passCount: 0,
        moveNum: 0,
        gameOver: false,
        winner: null,
        winLine: null,
        scores: null,
        terrMap: null,
        resignedBy: null,
        status: 'waiting',
        players: {
          black: { uid: user.uid },
          white: null,
        },
        hostUid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      onJoin({ code, myColor: BLACK });
    } catch (e) {
      console.error(e);
      setError(`방 생성 실패: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const joinRoom = async () => {
    setError(''); setBusy(true);
    try {
      const code = joinCode.trim().toUpperCase();
      if (code.length !== 6) { setError('방 코드는 6자리입니다.'); setBusy(false); return; }
      const user = await ensureSignedIn();
      const ref = doc(db, 'rooms', code);
      const snap = await getDoc(ref);
      if (!snap.exists()) { setError('해당 코드의 방이 없습니다.'); setBusy(false); return; }
      const data = snap.data();

      // If user is already in this room (e.g. rejoining), preserve their color.
      if (data.players?.black?.uid === user.uid) {
        onJoin({ code, myColor: 1 });
        return;
      }
      if (data.players?.white?.uid === user.uid) {
        onJoin({ code, myColor: 2 });
        return;
      }

      // Otherwise try to take the empty white slot.
      if (data.players?.white) { setError('방이 가득 찼습니다.'); setBusy(false); return; }
      await updateDoc(ref, {
        'players.white': { uid: user.uid },
        status: 'playing',
        updatedAt: serverTimestamp(),
      });
      onJoin({ code, myColor: 2 });
    } catch (e) {
      console.error(e);
      setError(`입장 실패: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: PAGE_BG, fontFamily: FONT, padding: 20 }}>
      <link href={FONT_LINK_HREF} rel="stylesheet" />
      <div style={card}>
        <button onClick={view === 'choose' ? onBack : () => setView('choose')}
          style={{ background: 'none', border: 'none', color: C.t4, fontFamily: FONT, fontSize: 13, cursor: 'pointer', marginBottom: 12, padding: 0 }}>
          ← {view === 'choose' ? '홈으로' : '돌아가기'}
        </button>

        <h2 style={{ textAlign: 'center', fontSize: 26, color: C.t1, margin: '0 0 4px', letterSpacing: 4 }}>온라인 대국</h2>
        <p style={{ textAlign: 'center', color: C.t5, fontSize: 12, margin: '0 0 28px', letterSpacing: 2 }}>1:1 ONLINE MATCH</p>

        {view === 'choose' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button onClick={() => setView('create')} style={{ ...primaryBtn }}>방 만들기</button>
            <button onClick={() => setView('join')} style={{
              ...primaryBtn,
              background: 'rgba(180,140,70,0.15)',
              color: C.t1,
              border: `1px solid ${C.gold}`,
            }}>코드로 입장</button>
          </div>
        )}

        {view === 'create' && (
          <>
            <div style={{ marginBottom: 20 }}>
              <label style={{ color: C.t3, fontSize: 11, letterSpacing: 2, display: 'block', marginBottom: 8, textTransform: 'uppercase' }}>게임 종류</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[['go', '바둑'], ['gomoku', '오목']].map(([k, l]) => (
                  <button key={k} onClick={() => { setGameType(k); setBoardSize(k === 'go' ? 9 : 15); }}
                    style={optBtn(gameType === k)}>{l}</button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ color: C.t3, fontSize: 11, letterSpacing: 2, display: 'block', marginBottom: 8, textTransform: 'uppercase' }}>바둑판 크기</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(gameType === 'go' ? [9, 13, 19] : [13, 15, 19]).map(s =>
                  <button key={s} onClick={() => setBoardSize(s)} style={optBtn(boardSize === s)}>{s}×{s}</button>
                )}
              </div>
            </div>

            <button onClick={createRoom} disabled={busy} style={primaryBtn}>
              {busy ? '생성 중...' : '방 만들기'}
            </button>
            <p style={{ color: C.t5, fontSize: 11, marginTop: 12, textAlign: 'center', lineHeight: 1.6 }}>
              방을 만든 사람은 <strong style={{ color: C.t2 }}>흑(선공)</strong>입니다.<br />
              생성된 코드를 상대에게 알려주세요.
            </p>
          </>
        )}

        {view === 'join' && (
          <>
            <div style={{ marginBottom: 20 }}>
              <label style={{ color: C.t3, fontSize: 11, letterSpacing: 2, display: 'block', marginBottom: 8, textTransform: 'uppercase' }}>방 코드</label>
              <input
                type="text"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
                placeholder="6자리 코드"
                style={{
                  width: '100%', padding: '14px 16px', borderRadius: 10,
                  border: `1px solid ${C.bdr}`, background: 'rgba(0,0,0,0.25)',
                  color: C.t1, fontFamily: FONT, fontSize: 22,
                  letterSpacing: 6, textAlign: 'center',
                  outline: 'none', boxSizing: 'border-box',
                }}
                onFocus={e => e.currentTarget.style.borderColor = C.gold}
                onBlur={e => e.currentTarget.style.borderColor = C.bdr}
              />
            </div>
            <button onClick={joinRoom} disabled={busy || joinCode.length !== 6} style={primaryBtn}>
              {busy ? '입장 중...' : '입장하기'}
            </button>
            <p style={{ color: C.t5, fontSize: 11, marginTop: 12, textAlign: 'center', lineHeight: 1.6 }}>
              입장한 사람은 <strong style={{ color: C.t2 }}>백(후공)</strong>입니다.
            </p>
          </>
        )}

        {error && (
          <div style={{
            marginTop: 16, padding: '10px 14px', borderRadius: 8,
            background: 'rgba(200,60,60,0.15)', border: '1px solid rgba(220,80,80,0.3)',
            color: '#ffb0b0', fontSize: 12, textAlign: 'center',
          }}>{error}</div>
        )}
      </div>
    </div>
  );
}
