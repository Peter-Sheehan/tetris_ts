# Tetris — React + TypeScript + Canvas, built from scratch

## Context

The project directory is currently empty. The goal is to scaffold a new React + TypeScript project and build a fully playable Tetris game: standard board, 7 tetrominoes, movement/rotation/gravity, line clearing and scoring, plus the "extras" — next-piece preview, hold piece, ghost piece, level-based speed-up, and a locally persisted high score. Rendering will be done on an HTML5 `<canvas>` rather than a DOM/CSS grid.

## Setup

```
npm create vite@latest . -- --template react-ts
npm install
npm install -D vitest
```

Vitest is added immediately because most of the game logic will be written as pure, framework-free TypeScript functions that are easy to unit test without a DOM.

## Architecture

The core design principle: **`src/game/` contains zero React/DOM code.** Every game-logic function takes plain data in and returns plain data out (board, pieces, actions → new state). React's job is limited to driving the loop, dispatching actions, and rendering the resulting state to canvas. This keeps the hardest logic (rotation, collision, line clears, scoring) testable in isolation and keeps components thin.

```
src/
├── main.tsx
├── App.tsx                     # owns the reducer + game loop wiring
│
├── game/                       # pure TS, no React/DOM — the core logic
│   ├── types.ts                # TetrominoType, Board, ActivePiece, GameState, GameAction, ...
│   ├── constants.ts            # board dims, timings, scoring table
│   ├── tetrominoes.ts          # shape matrices for all 7 pieces × 4 rotations
│   ├── randomizer.ts           # 7-bag shuffle + queue refill
│   ├── board.ts                # createEmptyBoard, isValidPosition, mergePiece, clearLines, getGhostPosition
│   ├── rotation.ts             # SRS rotation + wall-kick tables, tryRotate()
│   ├── scoring.ts              # score table, level calc, getDropIntervalMs()
│   └── gameState.ts            # gameReducer + transition fns (spawn/move/rotate/tick/hold/hardDrop)
│
├── hooks/
│   ├── useGameLoop.ts          # requestAnimationFrame + delta accumulator, dispatches TICK
│   ├── useKeyboardControls.ts  # keydown/keyup → dispatch
│   └── useHighScore.ts         # localStorage read/write
│
├── render/                     # pure canvas-drawing functions (ctx + data in)
│   ├── colors.ts
│   ├── drawBoard.ts
│   ├── drawPiece.ts
│   └── drawGhost.ts
│
└── components/
    ├── GameCanvas.tsx          # <canvas> ref; the boundary where loop/state/draw meet
    ├── NextPiecePreview.tsx
    ├── HoldPiece.tsx
    ├── ScorePanel.tsx
    ├── PauseOverlay.tsx
    └── GameOverOverlay.tsx
```

## Core data model (`game/types.ts`)

- Board: 10 cols × 22 rows (rows 0–1 hidden above the visible 20-row playfield, so pieces can spawn without visual clipping).
- `TetrominoType = 'I'|'O'|'T'|'S'|'Z'|'J'|'L'`, `RotationState = 0|1|2|3`, `Cell = TetrominoType | null`, `Board = Cell[][]`.
- `ActivePiece { type, rotation, position: {row, col} }`.
- `GameState { board, active, queue, bag, hold, canHold, score, level, linesCleared, status, dropTimer, lockTimer, lockResets, softDropping }`, `GameStatus = 'ready'|'playing'|'paused'|'gameover'`.
- `GameAction` discriminated union: `TICK`, `MOVE`, `ROTATE`, `SOFT_DROP_START/STOP`, `HARD_DROP`, `HOLD`, `PAUSE_TOGGLE`, `RESTART`.

Use SRS (Super Rotation System) for rotation — standard, well-documented kick tables, and not meaningfully more code than naive rotation. `rotation.ts` holds `JLSTZ_KICKS` and `I_KICKS`, each keyed by the 8 valid rotation transitions, mapping to 5 offsets to try in order; O piece never kicks.

## Game loop in React

- **Timing**: `requestAnimationFrame` with a delta-time accumulator (not `setInterval`) — avoids drift/throttling, naturally pauses on backgrounded tabs. Clamp delta to ~100ms to avoid a catch-up jump on tab refocus.
- **State**: single `useReducer(gameReducer, initialState)` in `App.tsx`. `useGameLoop` just dispatches `{type:'TICK', deltaMs}`; the reducer internally accumulates `dropTimer` and only advances the piece when it crosses `getDropIntervalMs(level)` — gravity speed is data-driven (level), not loop-frequency-driven.
- **Canvas redraw**: treat `<canvas>` as a React escape hatch — draw imperatively in a `useEffect` keyed on `state` (or directly after each dispatch in the loop callback). No need for a second animation loop; a 10×20 grid redraw is cheap.
- **Avoid stale closures**: keyboard listeners attach once in an empty-deps `useEffect` and call `dispatch` directly — `dispatch` identity is stable, so no staleness even though the handler is created once. If a handler needs to read current status, mirror it into a ref via a small effect rather than re-subscribing listeners.
- **Lock delay**: on gravity-blocked piece, don't instant-lock — start a ~500ms `lockTimer` that resets on successful move/rotate (cap resets, e.g. 15, to prevent infinite stalling). Expiry triggers merge → clear → score → spawn next.

## Pure function responsibilities

- `board.ts`: `createEmptyBoard`, `isValidPosition(board, piece)`, `mergePieceIntoBoard` (immutable), `clearLines` (handles non-adjacent full rows), `getGhostPosition` (simulate downward moves until invalid — no mutation, cheap enough to compute every frame).
- `rotation.ts`: `tryRotate(board, piece, dir)` — compute target rotation, look up kick table, test 5 offsets via `isValidPosition`, return first success or `null`.
- `randomizer.ts`: `shuffle7Bag` (Fisher-Yates), `refillQueue` (keep queue length ≥ 5, regenerate bag when exhausted — standard "fair" 7-bag randomizer).
- `scoring.ts`: guideline score table (single/double/triple/tetris = 100/300/500/800 × level; soft drop +1/cell, hard drop +2/cell), `calculateLevel(totalLines) = floor(lines/10)+1`, `getDropIntervalMs(level)` isolated in one function for easy tuning (start simple: `Math.max(100, 1000 - (level-1)*75)`).
- `gameState.ts`: `spawnNextPiece` (gameover if spawn collides), `applyMove`, `applyRotate`, `applyHardDrop`, `applyTick` (gravity + lock delay), `applyHold` (swap with hold slot, `canHold=false` until next natural spawn), `restartGame`.

## Keyboard input (`hooks/useKeyboardControls.ts`)

- Attach on `window` in one empty-deps `useEffect`; `preventDefault()` on arrows/Space to stop page scroll.
- Bindings: `←/→` move, `↓` soft drop, `↑`/`X` rotate CW, `Z` rotate CCW, `Space` hard drop, `C`/`Shift` hold, `P`/`Esc` pause, `Enter` restart on game-over.
- Discrete actions (rotate, hard drop, hold, pause): ignore `event.repeat`. Movement: rely on native key-repeat for `←/→/↓` as the first cut; add true DAS (delayed auto-shift) later only if it feels jerky.

## TypeScript config

Keep Vite's default `"strict": true`; add `"noUncheckedIndexedAccess": true` given how much of this code does raw `board[row][col]` indexing — catches off-by-one/bounds bugs early.

## Verification

Unit tests (Vitest, no DOM needed — this is why `game/` is kept pure):
- `board.test.ts` — edge/stack collisions, line clear incl. non-adjacent rows.
- `rotation.test.ts` — each kick transition, O-piece no-kick.
- `randomizer.test.ts` — no repeats within any 7-piece window.
- `scoring.test.ts` — level thresholds, monotonically decreasing drop interval.

Manual checklist (`npm run dev`):
- All 7 pieces spawn correctly across all 4 rotations; wall kicks work near walls/stack.
- Movement stops at walls/stack; soft drop speeds fall + scores; hard drop locks at ghost position + scores.
- Ghost piece tracks column/rotation in real time.
- Single/double/triple/tetris clears score correctly, including simultaneous non-adjacent rows.
- Hold swaps correctly, blocked until next natural spawn, restores correct orientation.
- Next-piece preview matches 7-bag order.
- Level/speed increase every 10 lines.
- Game over triggers on blocked spawn, freezes input, shows score vs. high score, restart fully resets state.
- Pause freezes gravity/input and resumes cleanly.
- High score persists across reload via `localStorage`.
- No page scroll on arrow/space keys; backgrounding+refocusing the tab doesn't cause an instant multi-row drop.
- `npm run build && npm run preview` — no TS errors, prod build matches dev behavior.

## Critical files

- `src/game/gameState.ts` — the reducer; architectural core tying spawn/move/rotate/lock/hold/score together.
- `src/game/board.ts` — collision detection, merge, line clearing, ghost simulation.
- `src/game/rotation.ts` — SRS + wall-kick tables, the trickiest data-correctness piece.
- `src/hooks/useGameLoop.ts` — rAF/accumulator timing without stale closures.
- `src/components/GameCanvas.tsx` — where loop, state, and draw layers meet.
