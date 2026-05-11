// Shared design tokens used across the local game, online lobby, and online game.

export const FONT = "'Noto Serif KR', Georgia, serif";

export const C = {
  bg: '#1a1410',
  card: 'rgba(60,48,36,0.95)',
  cardDk: 'rgba(40,30,22,0.98)',
  gold: '#c9a96e',
  goldDim: 'rgba(180,140,70,0.15)',
  t1: '#e8d5b5',
  t2: '#d4c0a0',
  t3: '#b8a080',
  t4: '#8a7560',
  t5: 'rgba(200,175,140,0.6)',
  bdr: 'rgba(180,150,100,0.2)',
};

export const PAGE_BG = `linear-gradient(145deg, ${C.bg} 0%, #2d2419 50%, ${C.bg} 100%)`;

export const FONT_LINK_HREF = 'https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;600;700&display=swap';

export const optBtn = (on) => ({
  flex: 1, padding: '10px 0', borderRadius: 8,
  border: on ? `2px solid ${C.gold}` : `1px solid ${C.bdr}`,
  background: on ? C.goldDim : 'transparent',
  color: on ? C.t1 : C.t4,
  fontFamily: FONT, fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
});

export const gameBtn = {
  padding: '8px 16px', borderRadius: 8,
  border: '1px solid rgba(180,150,100,0.3)',
  background: 'rgba(60,48,36,0.8)', color: C.t2,
  fontFamily: FONT, fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

export const primaryBtn = {
  width: '100%', padding: 14, borderRadius: 10, border: 'none',
  background: `linear-gradient(135deg, ${C.gold}, #a88540)`,
  color: '#1a1410', fontFamily: FONT, fontSize: 18, fontWeight: 700,
  cursor: 'pointer', letterSpacing: 2,
  boxShadow: '0 4px 20px rgba(180,140,70,0.3)',
};
