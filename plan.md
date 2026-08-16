# Tetris — React + TypeScript + CSS, built from scratch

## Context

The project directory is currently empty. The goal is to scaffold a new React + TypeScript project and build a fully playable Tetris game: standard board, 7 tetrominoes, movement/rotation/gravity, line clearing and scoring, plus the "extras" — next-piece preview, hold piece, ghost piece, level-based speed-up, and a locally persisted high score. Rendering will be done as a CSS/DOM grid rather than `<canvas>` — the board is only 10×20 cells, so a `<div>` grid is cheap to re-render and gets styling, transitions, and devtools inspection for free, at the cost of manual pixel/draw-call control that canvas would offer.

## Setup

```
npm create vite@latest . -- --template react-ts
npm install
npm install -D vitest
```

Vitest is added immediately because most of the game logic will be written as pure, framework-free TypeScript functions that are easy to unit test without a DOM.

## Architecture

The core design principle: **`src/game/` contains zero React/DOM code.** Every game-logic function takes plain data in and returns plain data out (board, pieces, actions → new state). React's job is limited to driving the loop, dispatching actions, and rendering the resulting state as HTML/CSS. This keeps the hardest logic (rotation, collision, line clears, scoring) testable in isolation and keeps components thin. This layer is unaffected by the canvas-vs-CSS choice — only the rendering components change.

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
└── components/
    ├── Board.tsx                # CSS grid container; maps board cells + active piece + ghost to <Cell>s
    ├── Cell.tsx                  # single grid cell, colored via TetrominoType → CSS class/variable
    ├── Board.module.css          # grid-template-columns/rows sized to BOARD_COLS/BOARD_ROWS
    ├── NextPiecePreview.tsx       # small grid rendering upcoming queue entries
    ├── HoldPiece.tsx              # small grid rendering held piece (dimmed if canHold=false)
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
- **Rendering**: `Board.tsx` derives a flat array of 200 cell values (locked board + active piece + ghost piece overlaid) from `state` on every render via a plain function (no extra effect needed) and maps it to `<Cell>` elements; React's normal reconciliation handles the diffing, since only a handful of cells change per tick. `Board.module.css` uses CSS Grid (`display:grid; grid-template-columns: repeat(10, 1fr)`) sized via CSS custom properties or a fixed cell size.
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

## Suggested build order

Work bottom-up through the dependency chain — each step only depends on what's already built, and stays testable/verifiable in isolation before moving on.

1. **`game/types.ts` + `game/constants.ts`** — nail down the data shapes and board dimensions first; everything else references these.
2. **`game/tetrominoes.ts`** — shape matrices for all 7 pieces × 4 rotations. Sanity-check by logging/printing each rotation's grid.
3. **`game/board.ts`** — `createEmptyBoard`, `isValidPosition`, `mergePieceIntoBoard`, `clearLines`. Write `board.test.ts` alongside this; these are the functions most worth locking down with tests early since everything downstream depends on them being correct.
4. **`game/rotation.ts`** — SRS kick tables + `tryRotate`. Test against the standard kick cases (wall kicks, T-spin-adjacent positions).
5. **`game/randomizer.ts`** — 7-bag shuffle + queue refill. Quick to build and test in isolation.
6. **`game/scoring.ts`** — score table, level calc, drop interval. Pure math, no dependencies on the rest.
7. **`game/gameState.ts`** — the reducer, wiring steps 2–6 together (spawn, move, rotate, tick/gravity+lock delay, hard drop, hold, restart). This is the biggest step — build and test `applyMove`/`applyRotate` first (no timing involved), then `applyTick` (gravity + lock delay), then `applyHardDrop`, then `applyHold` last since it's the least critical path.
8. **`components/Board.tsx` + `Cell.tsx` + `Board.module.css`** — get the board rendering static state first (e.g. a hardcoded test board) before wiring it to the reducer. Confirms the CSS grid sizing/layout works before adding interactivity.
9. **`hooks/useKeyboardControls.ts`** — wire movement/rotation/hard drop keys to `dispatch`. At this point the game should be playable end-to-end (minus gravity).
10. **`hooks/useGameLoop.ts`** — add the rAF/accumulator loop dispatching `TICK`, so gravity and lock delay kick in. Now the core game loop is complete and playable start-to-finish.
11. **`components/ScorePanel.tsx`, `GameOverOverlay.tsx`, `PauseOverlay.tsx`** — surface score/level/lines and handle game-over/pause/restart flows.
12. **`components/NextPiecePreview.tsx`, `HoldPiece.tsx`** — the "extras" that don't affect core playability, add once the base loop feels solid.
13. **`hooks/useHighScore.ts`** — localStorage persistence, wire into `GameOverOverlay`.
14. **Polish pass** — run through the full manual testing checklist below, tune `getDropIntervalMs` feel, adjust colors/styling.

Rationale for this order: steps 1–7 are pure logic with no UI, so they can be built and verified (via Vitest or quick console checks) without a running dev server. Step 8 gets pixels on screen early so you're not debugging rendering and game logic at the same time. Steps 9–10 make the game actually playable as early as possible, before investing in secondary UI (score panel, previews, high scores) — if something about the core feel (drop speed, controls) needs rethinking, better to find out before building the surrounding chrome.

## Learning resources

**Tetris mechanics (rules, rotation, scoring — read before step 2–7 above):**
- [Tetris Guideline](https://tetris.wiki/Tetris_Guideline) — the actual spec this plan follows (spawn behavior, 7-bag, scoring table, board size).
- [Super Rotation System](https://tetris.wiki/Super_Rotation_System) — the rotation model used in `game/rotation.ts`, including the exact kick-table values you'll hardcode.
- [Wall kick](https://tetris.wiki/Wall_kick) — the "why" behind the kick offsets, with worked examples.

**React patterns used in this plan:**
- [react.dev — `useReducer`](https://react.dev/reference/react/useReducer) — the state-management pattern for `gameState.ts`.
- [react.dev — `useEffect`](https://react.dev/reference/react/useEffect) — for the keyboard-listener and game-loop hooks (pay attention to the cleanup-function and empty-deps-array sections, since that's exactly what avoids the stale-closure bug mentioned in the plan).
- [MDN — `requestAnimationFrame`](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame) — the timing primitive behind `useGameLoop.ts`.
- [MDN — CSS Grid Layout](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout) — for `Board.module.css`.

**Video walkthroughs (build-along tutorials, useful for seeing the overall shape before/while you build your own):**
- [freeCodeCamp — Learn React Hooks by Building a Tetris Game](https://www.freecodecamp.org/news/react-hooks-tetris-game/) (~3hr video + written article) — closest match to this plan's approach: React hooks, no game engine library. Note it uses Styled Components rather than plain CSS modules and doesn't use SRS rotation, so treat it as a reference for the React/hooks wiring, not the rotation/scoring rules — follow this plan and the Tetris Guideline links above for those.
- [React Tetris with TypeScript – YouTube](https://www.youtube.com/watch?v=jEjj2jvHpv4) — TypeScript-specific version, useful for seeing how types are threaded through the piece/board logic.

Worth reading the Guideline/SRS/wall-kick pages fully before writing `game/rotation.ts` — that's the one piece of logic in this plan that's genuinely hard to get right from intuition alone; the tutorials above mostly skip or simplify it.

## Critical files

- `src/game/gameState.ts` — the reducer; architectural core tying spawn/move/rotate/lock/hold/score together.
- `src/game/board.ts` — collision detection, merge, line clearing, ghost simulation.
- `src/game/rotation.ts` — SRS + wall-kick tables, the trickiest data-correctness piece.
- `src/hooks/useGameLoop.ts` — rAF/accumulator timing without stale closures.
- `src/components/Board.tsx` — where loop, state, and CSS grid rendering meet; derives the cell array each render.
