import React from 'react';
import { EMPTY, BLACK, WHITE, getStarPoints } from './gameLogic';
import { C } from './styles';

// Pure SVG board renderer. Owns no game state — it just paints what it's given
// and emits click/hover events with board coordinates. Used by both the local
// BoardArena and the online OnlineGame.
export default function BoardView({
  board, size, gameType,
  lastMove, hover, currentColor,
  terrMap, winLine,
  onClick, onHover, onLeave,
  disabled = false,
}) {
  // Cell size in CSS px — picked so the natural board comfortably fills a
  // typical laptop screen. The SVG also scales down via maxWidth/maxHeight
  // below, so smaller viewports still fit.
  const cellSize = size >= 19 ? 34 : size >= 15 ? 42 : size >= 13 ? 48 : 60;
  const pad = cellSize * 1.2;
  const svgW = cellSize * (size - 1) + pad * 2;
  const stars = getStarPoints(size);
  const tx = x => pad + x * cellSize;
  const ty = y => pad + y * cellSize;
  const isGo = gameType === 'go';

  const handleClick = (e) => {
    if (disabled || !onClick) return;
    const svg = e.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const sp = pt.matrixTransform(svg.getScreenCTM().inverse());
    const x = Math.round((sp.x - pad) / cellSize);
    const y = Math.round((sp.y - pad) / cellSize);
    if (x >= 0 && x < size && y >= 0 && y < size) onClick(x, y);
  };

  const handleMove = (e) => {
    if (disabled) { onLeave?.(); return; }
    if (!onHover) return;
    const svg = e.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const sp = pt.matrixTransform(svg.getScreenCTM().inverse());
    const x = Math.round((sp.x - pad) / cellSize);
    const y = Math.round((sp.y - pad) / cellSize);
    if (x >= 0 && x < size && y >= 0 && y < size && board && board[y][x] === EMPTY) {
      onHover({ x, y });
    } else {
      onHover(null);
    }
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg,rgba(60,48,36,0.6),rgba(40,30,22,0.6))',
      borderRadius: 12, padding: 4,
      border: '1px solid rgba(180,150,100,0.1)',
      boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
    }}>
      <svg width={svgW} height={svgW} viewBox={`0 0 ${svgW} ${svgW}`}
        onClick={handleClick} onMouseMove={handleMove} onMouseLeave={onLeave}
        style={{ display: 'block', cursor: disabled ? 'default' : 'pointer', maxWidth: '94vw', maxHeight: '82vh' }}>
        <defs>
          <radialGradient id="bs" cx="35%" cy="35%">
            <stop offset="0%" stopColor="#666" />
            <stop offset="50%" stopColor="#333" />
            <stop offset="100%" stopColor="#111" />
          </radialGradient>
          <radialGradient id="ws" cx="35%" cy="35%">
            <stop offset="0%" stopColor="#fff" />
            <stop offset="70%" stopColor="#eee" />
            <stop offset="100%" stopColor="#ccc" />
          </radialGradient>
          <filter id="sh"><feDropShadow dx="1" dy="1.5" stdDeviation="1.5" floodOpacity="0.4" /></filter>
          <pattern id="wg" patternUnits="userSpaceOnUse" width="200" height="200">
            {[...Array(20)].map((_, i) => (
              <line key={i} x1="0" y1={i*10 + Math.sin(i)*3} x2="200" y2={i*10 + Math.cos(i)*3}
                stroke="rgba(120,80,20,0.15)" strokeWidth={0.5 + ((i*7)%3) * 0.3} />
            ))}
          </pattern>
        </defs>

        <rect width={svgW} height={svgW} rx="8" fill="#d4a34a" />
        <rect width={svgW} height={svgW} rx="8" fill="url(#wg)" opacity="0.3" />

        {[...Array(size)].map((_, i) => (
          <React.Fragment key={i}>
            <line x1={tx(0)} y1={ty(i)} x2={tx(size-1)} y2={ty(i)} stroke="#5a4020" strokeWidth={i===0||i===size-1?1.5:0.8} />
            <line x1={tx(i)} y1={ty(0)} x2={tx(i)} y2={ty(size-1)} stroke="#5a4020" strokeWidth={i===0||i===size-1?1.5:0.8} />
          </React.Fragment>
        ))}

        {stars.map(([sx, sy]) => (
          <circle key={`s${sx}-${sy}`} cx={tx(sx)} cy={ty(sy)} r={cellSize*0.1} fill="#5a4020" />
        ))}

        {/* Territory markers (Go end) */}
        {isGo && terrMap && board && board.map((row, y) => row.map((cell, x) => {
          if (cell !== EMPTY || !terrMap[y][x]) return null;
          return <rect key={`t${x}-${y}`} x={tx(x) - cellSize*0.15} y={ty(y) - cellSize*0.15}
            width={cellSize*0.3} height={cellSize*0.3}
            fill={terrMap[y][x] === BLACK ? '#222' : '#eee'} opacity={0.7} rx={2} />;
        }))}

        {/* Win line (Gomoku) */}
        {!isGo && winLine && winLine.length >= 5 && (
          <line x1={tx(winLine[0][0])} y1={ty(winLine[0][1])}
            x2={tx(winLine[winLine.length-1][0])} y2={ty(winLine[winLine.length-1][1])}
            stroke="rgba(220,60,60,0.65)" strokeWidth={cellSize*0.14} strokeLinecap="round" />
        )}

        {/* Stones */}
        {board && board.map((row, y) => row.map((cell, x) => {
          if (cell === EMPTY) return null;
          return <circle key={`${x},${y}`} cx={tx(x)} cy={ty(y)} r={cellSize*0.44}
            fill={cell === BLACK ? 'url(#bs)' : 'url(#ws)'}
            stroke={cell === WHITE ? '#aaa' : 'none'} strokeWidth={cell === WHITE ? 0.5 : 0}
            filter="url(#sh)" />;
        }))}

        {/* Last move marker */}
        {lastMove && board && board[lastMove.y]?.[lastMove.x] !== EMPTY && (
          <circle cx={tx(lastMove.x)} cy={ty(lastMove.y)} r={cellSize*0.12}
            fill="none" stroke={C.gold} strokeWidth={2} />
        )}

        {/* Hover ghost stone */}
        {hover && !disabled && (
          <circle cx={tx(hover.x)} cy={ty(hover.y)} r={cellSize*0.38}
            fill={currentColor === BLACK ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.4)'}
            style={{ pointerEvents: 'none' }} />
        )}
      </svg>
    </div>
  );
}
