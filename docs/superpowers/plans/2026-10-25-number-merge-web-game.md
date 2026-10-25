# Number-Merge Web Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-web Number-Merge puzzle: drag a chain of blocks across the grid, watch them merge by the original game's rules, with three unlimited power-ups, as an endless session.

**Architecture:** An engine-agnostic TypeScript **logic core** (pure functions + a `Board` model: connect rule, merge math, shift/refill, move-availability, power-ups) with no Phaser imports, fully unit-tested with Vitest. A thin **Phaser 3 presentation layer** renders the board, drives pointer input for the retractable drag, and animates merges. The core is the source of truth; Phaser only reads core state and sends it intents.

**Tech Stack:** TypeScript, Vite, Vitest (logic tests), Phaser 3 (WebGL renderer + pointer input + tweens). No BigInteger lib — `number` for tier values, `bigint` for the score accumulator.

**Spec:** `docs/superpowers/specs/2026-10-25-number-merge-web-game-design.md`

## Global Constraints

- Board is **5 columns × 7 rows** (`COLS = 5`, `ROWS = 7`).
- Each block has an integer **tier ≥ 1**; its **value = `2^tier`** (`value = 2 ** tier`, a JS `number` — exact through tier 53, far beyond play).
- **Connect rule** (compared against the immediately-previous block in the path): next tier **equal** to previous, OR **exactly +1** but **only when the chain already holds ≥ 2 blocks** — so the opening pair must be equal.
- **Merge:** a committed chain of **≥ 2** blocks; `total = Σ 2^tier` over consumed blocks; result is **one** block at the chain's **last** cell, tier = **`floor(log2(total))`**; leftover value is **discarded**; move score = `total` (added to a `bigint` accumulator).
- **Highest tier reached** is **monotonic** (never decreases); it drives spawn-tier scaling.
- **Adjacency: 8-way** (orthogonal + diagonal).
- **Power-ups** are **unlimited**; Magnet needs **≥ 2** blocks of the tapped tier; power-ups are **inert mid-drag**.
- **No persistence** in v1 (reload = fresh game).
- Logic core has **zero Phaser imports**; all core behavior is unit-tested without Phaser.

## Review Focus

- **Degenerate initial seed:** a random fill with no legal move must be re-rolled so launch is never an instant dead-end (Task 5 test).
- **Single-column collapse:** after a merge that empties cells mid-column, remaining blocks must fall with no floating gaps and no lost/duplicated blocks (Task 6 test).
- **Chain revisit / backtrack to head:** dragging back onto the head (index 0) clears everything after it and leaves a 1-length chain, which must then commit as a no-op, not a merge (Task 3 + Task 4 tests).
- **Magnet on a singleton tier:** tapping a tier with only one instance must be rejected (not consumed, no board change) (Task 7 test).
- **Total that is not a power of two:** merge tier must floor correctly and score must still bank the full sum (e.g. three tier-3 → tier-4, score 24) (Task 4 test).

---

## File Structure

- `src/core/types.ts` — shared types: `Tier`, `Cell`, `Pos`, `Board` shape, `MergeResult`.
- `src/core/board.ts` — `Board` creation, cell access, 8-way neighbors, equality helpers.
- `src/core/connect.ts` — `canExtendChain`, `applyPointer` (retractable-path state machine).
- `src/core/merge.ts` — `mergeTotal`, `tierFromTotal`, `resolveMerge`.
- `src/core/gravity.ts` — `collapseColumns`, `refill`.
- `src/core/moves.ts` — `hasAnyMove` (game-over detection).
- `src/core/spawn.ts` — spawn-tier range from highest-tier-reached; `randomTier`.
- `src/core/seed.ts` — `seedBoard` with solvability re-roll.
- `src/core/powerups.ts` — `hammer`, `magnet`, `magnetUsable`, `swap`.
- `src/core/game.ts` — `Game` facade tying the core together (drag session, commit, power-up actions, score, reached-tier, game-over).
- `src/phaser/` — Phaser scene(s), input, rendering, tweens (presentation layer).
- `tests/core/*.test.ts` — Vitest unit tests per core module.

---

### Task 1: Project scaffold + core types

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `.gitignore`
- Create: `src/core/types.ts`
- Test: `tests/core/types.test.ts`

**Interfaces:**
- Produces:
  - `type Tier = number` (integer ≥ 1)
  - `interface Cell { tier: Tier }` and board cells are `Cell | null`
  - `interface Pos { col: number; row: number }`
  - `type Grid = (Cell | null)[][]` indexed `grid[row][col]`
  - `const COLS = 5`, `const ROWS = 7`
  - `function tierValue(tier: Tier): number` → `2 ** tier`

- [ ] **Step 1: Write the failing test** — `tests/core/types.test.ts`: `tierValue(1) === 2`, `tierValue(3) === 8`, `tierValue(10) === 1024`; `COLS === 5`, `ROWS === 7`.
- [ ] **Step 2: Run test to verify it fails** — Run: `npx vitest run tests/core/types.test.ts`. Expected: FAIL (module/exports not found).
- [ ] **Step 3: Scaffold the project** — `npm create vite@latest` equivalent by hand: a Vite + TS app with `phaser@3.90.0` as a dependency and `vitest@3.2.4` as a dev dependency. `package.json` scripts: `dev` (vite), `build` (tsc + vite build), `test` (vitest run). `.gitignore` includes `node_modules`, `dist`. Then write `src/core/types.ts` with the Produces interface above.
- [ ] **Step 4: Run test to verify it passes** — Run: `npx vitest run tests/core/types.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json vite.config.ts vitest.config.ts index.html .gitignore src/core/types.ts tests/core/types.test.ts
git commit -m "feat: scaffold Vite+TS+Phaser project and core types"
```

---

### Task 2: Board model + 8-way neighbors

**Files:**
- Create: `src/core/board.ts`
- Test: `tests/core/board.test.ts`

**Interfaces:**
- Consumes: `types.ts` (`Grid`, `Cell`, `Pos`, `COLS`, `ROWS`)
- Produces:
  - `function createGrid(fill: (pos: Pos) => Cell | null): Grid`
  - `function cellAt(grid: Grid, pos: Pos): Cell | null`
  - `function inBounds(pos: Pos): boolean`
  - `function neighbors8(pos: Pos): Pos[]` — up to 8 in-bounds orthogonal+diagonal neighbors
  - `function samePos(a: Pos, b: Pos): boolean`

- [ ] **Step 1: Write the failing test** — `neighbors8({col:0,row:0})` returns exactly the 3 in-bounds corners `(1,0),(0,1),(1,1)`; a center cell returns 8; `inBounds` rejects `col:-1` and `col:5`/`row:7`.
- [ ] **Step 2: Run to verify it fails** — Run: `npx vitest run tests/core/board.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the Produces functions in `src/core/board.ts`.
- [ ] **Step 4: Run to verify it passes** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: board grid model and 8-way neighbors`.

---

### Task 3: Connect rule + retractable path state machine

**Files:**
- Create: `src/core/connect.ts`
- Test: `tests/core/connect.test.ts`

**Interfaces:**
- Consumes: `board.ts` (`neighbors8`, `cellAt`, `samePos`), `types.ts`
- Produces:
  - `function canExtendChain(prevTier: Tier, nextTier: Tier, chainLength: number): boolean` — true if `nextTier === prevTier`, or (`chainLength >= 2` and `nextTier === prevTier + 1`). (`chainLength` = number of blocks already in the path before adding `next`.)
  - `function applyPointer(grid: Grid, path: Pos[], pointer: Pos): Pos[]` — returns the new path:
    - empty path + pointer on a block → `[pointer]`.
    - pointer on a position **already in** `path` → truncate so that revisited position becomes the last element (backtrack); revisiting index 0 yields `[path[0]]`.
    - pointer adjacent (8-way) to the current head, not in path, and `canExtendChain(tier(head), tier(pointer), path.length)` → append.
    - otherwise → path unchanged.

- [ ] **Step 1: Write the failing tests** —
  - `canExtendChain`: `(3,3,1)→true`; `(3,4,1)→false` (opening pair can't be +1); `(3,4,2)→true`; `(3,5,5)→false`; `(4,3,5)→false`.
  - `applyPointer`: opening on a block → length-1 path; equal-adjacent append; +1 append only after length ≥ 2; backtrack onto an earlier path member truncates; revisiting head → `[head]`; invalid/non-adjacent pointer → unchanged.
- [ ] **Step 2: Run to verify it fails** — Expected: FAIL.
- [ ] **Step 3: Implement** `connect.ts`. The state machine orders checks as: already-in-path (backtrack) first, then adjacency+connect-rule append, else no-op.
- [ ] **Step 4: Run to verify it passes** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: connect rule and retractable drag path`.

---

### Task 4: Merge resolution

**Files:**
- Create: `src/core/merge.ts`
- Test: `tests/core/merge.test.ts`

**Interfaces:**
- Consumes: `types.ts` (`Tier`, `tierValue`), `board.ts`
- Produces:
  - `function mergeTotal(tiers: Tier[]): number` — `Σ 2^tier`.
  - `function tierFromTotal(total: number): Tier` — `floor(log2(total))`.
  - `interface MergeResult { landed: Pos; tier: Tier; score: bigint; consumed: Pos[] }`
  - `function resolveMerge(grid: Grid, path: Pos[]): MergeResult | null` — null if `path.length < 2`; else total over the path's cells, `tier = tierFromTotal(total)`, `landed = path[path.length-1]`, `score = BigInt(total)`, `consumed = path`.

- [ ] **Step 1: Write the failing tests** —
  - `mergeTotal([3,3]) === 16`; `tierFromTotal(16) === 4`; `tierFromTotal(24) === 4` (not a power of two → floors).
  - `resolveMerge` on a 2-block equal path (two tier-3) → `tier 4`, `score 16n`, landed at the last pos; three tier-3 → `tier 4`, `score 24n` (**Review Focus: non-power-of-two total**).
  - `resolveMerge` on a length-1 path → `null`.
- [ ] **Step 2: Run to verify it fails** — Expected: FAIL.
- [ ] **Step 3: Implement** `merge.ts`. `tierFromTotal` via `Math.floor(Math.log2(total))`.
- [ ] **Step 4: Run to verify it passes** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: merge total, tier-from-total, and resolution`.

---

### Task 5: Spawn range + seeding with solvability re-roll

**Files:**
- Create: `src/core/spawn.ts`, `src/core/seed.ts`
- Test: `tests/core/spawn.test.ts`, `tests/core/seed.test.ts`
- Note: depends on Task 6's `hasAnyMove`? No — `hasAnyMove` lives in Task 6. To avoid a forward dependency, **Task 5 ships `spawn.ts` and a seed that re-rolls using a locally-passed predicate**; `seedBoard` takes the move-check as a parameter so it does not import `moves.ts`.

**Interfaces:**
- Consumes: `types.ts`, `board.ts`
- Produces:
  - `function spawnRange(reachedTier: Tier): { min: Tier; max: Tier }` — monotonic non-decreasing in `reachedTier`; `min ≥ 1`. Simple rule: `min = 1 + floor(max(0, reachedTier - 3) / 2)`, `max = min + 3` (documented as builder default; keep it in one place).
  - `function randomTier(range: {min:Tier;max:Tier}, rng: () => number): Tier`
  - `function seedBoard(rng: () => number, hasMove: (g: Grid) => boolean): Grid` — fills every cell from `spawnRange(1)` and re-rolls the whole grid until `hasMove` is true.

- [ ] **Step 1: Write the failing tests** —
  - `spawnRange`: monotonic across `reachedTier` 1..30 (min and max never decrease); `min ≥ 1`.
  - `seedBoard` with a stub `hasMove` that returns false twice then true → the returned grid is the third roll (proves re-roll); with `hasMove` always true → full grid, no nulls (**Review Focus: degenerate seed**).
- [ ] **Step 2: Run to verify it fails** — Expected: FAIL.
- [ ] **Step 3: Implement** `spawn.ts` and `seed.ts`.
- [ ] **Step 4: Run to verify it passes** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: spawn-tier range and solvable board seeding`.

---

### Task 6: Gravity collapse + refill + move availability

**Files:**
- Create: `src/core/gravity.ts`, `src/core/moves.ts`
- Test: `tests/core/gravity.test.ts`, `tests/core/moves.test.ts`

**Interfaces:**
- Consumes: `types.ts`, `board.ts` (`neighbors8`), `connect.ts` (`canExtendChain`), `spawn.ts`
- Produces:
  - `function collapseColumns(grid: Grid): Grid` — within each column, non-null cells fall to the bottom, nulls rise to the top; block count and identity per column preserved.
  - `function refill(grid: Grid, range: {min:Tier;max:Tier}, rng: () => number): Grid` — fills every null cell with a new block from `range`.
  - `function hasAnyMove(grid: Grid): boolean` — true if any cell has an 8-way neighbor it could start a valid chain with. A chain can always start iff some adjacent pair is **equal** (the opening pair must be equal), so the check is: exists adjacent pair with equal tiers.

- [ ] **Step 1: Write the failing tests** —
  - `collapseColumns`: a column `[t2,null,t5,null]` (top→bottom) → `[null,null,t2,t5]`; counts preserved; no floating gaps (**Review Focus: single-column collapse**).
  - `refill`: all nulls filled, existing blocks untouched.
  - `hasAnyMove`: a board with one equal adjacent pair → true; a board with no equal adjacency (even if +1 pairs exist) → false (opening pair must be equal).
- [ ] **Step 2: Run to verify it fails** — Expected: FAIL.
- [ ] **Step 3: Implement** `gravity.ts` and `moves.ts`.
- [ ] **Step 4: Run to verify it passes** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: gravity collapse, refill, and move availability`.

---

### Task 7: Power-ups

**Files:**
- Create: `src/core/powerups.ts`
- Test: `tests/core/powerups.test.ts`

**Interfaces:**
- Consumes: `types.ts`, `board.ts`, `merge.ts` (`mergeTotal`, `tierFromTotal`)
- Produces:
  - `function hammer(grid: Grid, target: Pos): Grid` — target cell → null.
  - `function magnetUsable(grid: Grid, target: Pos): boolean` — `true` iff ≥ 2 cells share the target's tier (including the target).
  - `function magnet(grid: Grid, target: Pos): Grid | null` — null if `!magnetUsable`; else all cells of that tier become null, and the target cell gets one block at `tierFromTotal(mergeTotal([...those tiers]))`.
  - `function swap(grid: Grid, a: Pos, b: Pos): Grid` — exchange the two cells' contents; valid for any two distinct positions (adjacent allowed); no merge.

- [ ] **Step 1: Write the failing tests** —
  - `hammer`: target becomes null, others untouched.
  - `magnetUsable`: singleton tier → false; two+ → true. `magnet` on singleton → null, grid unchanged (**Review Focus: Magnet singleton**); on three tier-3 → those cells cleared, target cell = tier `tierFromTotal(24) = 4`.
  - `swap`: two blocks exchange positions; swapping a block with an empty cell moves it; no refill/collapse happens here.
- [ ] **Step 2: Run to verify it fails** — Expected: FAIL.
- [ ] **Step 3: Implement** `powerups.ts`.
- [ ] **Step 4: Run to verify it passes** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: hammer, magnet, and swap power-ups`.

---

### Task 8: Game facade (ties the core together)

**Files:**
- Create: `src/core/game.ts`
- Test: `tests/core/game.test.ts`

**Interfaces:**
- Consumes: all core modules above.
- Produces a `Game` class (constructor takes an injectable `rng: () => number`, default `Math.random`):
  - `get grid(): Grid`, `get score(): bigint`, `get reachedTier(): Tier`, `get isOver(): boolean`, `get path(): Pos[]`
  - `startNew(): void` — seeds a solvable board (uses `seedBoard` with `hasAnyMove`), resets score to `0n`, reachedTier to `1`, clears path.
  - `pointer(pos: Pos): void` — updates the drag path via `applyPointer` (ignored if a power-up targeting mode is active — see below).
  - `commit(): MergeResult | null` — resolves the current path; on a real merge: clears consumed cells, places the landed block, runs collapse + refill (range from current `reachedTier`), adds `score`, raises `reachedTier` to the landed tier **if higher** (monotonic), recomputes `isOver` via `hasAnyMove`; clears path. On null (short chain): just clears path, no board change.
  - `useHammer(target)`, `useMagnet(target)`, `useSwap(a,b)` — apply the matching power-up, then (Hammer/Magnet only) collapse + refill and recompute `isOver`; Swap does neither. Magnet on an unusable target is a no-op returning `false`.
  - A `targetingMode` flag such that `pointer()` is ignored while targeting, and starting a drag cancels targeting — encodes "power-ups inert mid-drag / drag cancels targeting".

- [ ] **Step 1: Write the failing tests** (deterministic `rng`) —
  - `startNew` → full board, `score === 0n`, `reachedTier === 1`, `!isOver`.
  - A scripted equal-pair drag + `commit` → score increases by the summed total, landed block present, consumed cells refilled (no nulls), `reachedTier` rose to the merged tier.
  - `commit` on a 1-length path → `null`, board unchanged except path cleared (**Review Focus: backtrack-to-head commits as no-op**).
  - `reachedTier` never decreases across a lower-tier merge after a higher one (monotonic).
  - `pointer()` ignored while `targetingMode` true; beginning a drag clears targeting.
- [ ] **Step 2: Run to verify it fails** — Expected: FAIL.
- [ ] **Step 3: Implement** `game.ts`.
- [ ] **Step 4: Run to verify it passes — and the whole core suite** — Run: `npx vitest run`. Expected: all PASS.
- [ ] **Step 5: Commit** — `feat: game facade wiring the logic core`.

---

### Task 9: Phaser presentation — board render + retractable drag

**Files:**
- Create: `src/main.ts` (Phaser `Game` config, mounts `BoardScene`)
- Create: `src/phaser/BoardScene.ts`
- Create: `src/phaser/layout.ts` (grid→pixel mapping, responsive sizing)
- Test: `tests/phaser/layout.test.ts` (pure layout math only; scene is validated by running the app, not unit tests)

**Interfaces:**
- Consumes: `src/core/game.ts`, `src/phaser/layout.ts`
- Produces:
  - `layout.ts`: `function cellSize(viewportW: number, viewportH: number): number`, `function cellCenter(pos: Pos, origin, size): {x:number;y:number}`, `function posFromPixel(x, y, origin, size): Pos | null` — pure functions, no Phaser.
  - `BoardScene`: renders each cell as a rounded rect + number text from `game.grid`; `pointerdown`/`pointermove` call `posFromPixel` → `game.pointer(pos)` and redraw the path line + highlights every frame the path changes; `pointerup` calls `game.commit()` and triggers the merge animation (travel consumed blocks to landed cell, pop the result with a scale-bounce, count the score up). 16px side gutter, no horizontal scroll at phone width.

- [ ] **Step 1: Write the failing test** — `layout.test.ts`: `posFromPixel(cellCenter(p, origin, size), origin, size)` round-trips to `p` for several positions; a pixel outside the grid → `null`; `cellSize` fits 5 columns within a 360px-wide viewport with gutter.
- [ ] **Step 2: Run to verify it fails** — Run: `npx vitest run tests/phaser/layout.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `layout.ts` (pure), then `BoardScene.ts` + `main.ts`. Approach: one container per cell; a `Graphics` for the chain line; on `game.path` change, redraw line through `cellCenter` of each path pos and scale/tint selected blocks; on commit, tween consumed sprites to the landed center then tween the result sprite scale 0→1.1→1.
- [ ] **Step 4: Verify** — layout test PASSES (`npx vitest run tests/phaser/layout.test.ts`); then `npm run dev` and confirm in a browser: dragging across adjacent equal/-+1 blocks builds a visible chain, backtracking retracts it, release merges with animation and the board refills. (Manual run-the-app check; see superpowers:run if available.)
- [ ] **Step 5: Commit** — `feat: Phaser board scene with retractable drag and merge animation`.

---

### Task 10: Phaser presentation — power-up bar, game-over, polish

**Files:**
- Modify: `src/phaser/BoardScene.ts`
- Create: `src/phaser/PowerBar.ts`, `src/phaser/GameOver.ts`
- Test: (manual run-the-app; no new unit tests — logic is already covered in the core)

**Interfaces:**
- Consumes: `src/core/game.ts`, `BoardScene`
- Produces: a bottom bar with three buttons (Hammer/Magnet/Swap). Tapping a button enters `targetingMode`; the next board tap(s) call `game.useHammer/useMagnet/useSwap`; tapping the active button again cancels; Magnet dims tiers with only one instance; a game-over overlay with final score and a "New game" button calling `game.startNew()`.

- [ ] **Step 1:** Implement `PowerBar.ts` + `GameOver.ts` and wire them into `BoardScene`. Enforce: board taps during `targetingMode` route to the power-up, not a drag; starting a drag cancels targeting (already in `game.ts`).
- [ ] **Step 2: Verify** — `npm run dev`; confirm each power-up works (Hammer destroys, Magnet merges a tier and rejects singletons, Swap exchanges two blocks), board shifts/refills after Hammer/Magnet, and the game-over overlay appears when no move remains and restarts cleanly.
- [ ] **Step 3: Run the full suite** — Run: `npx vitest run`. Expected: all PASS.
- [ ] **Step 4: Commit** — `feat: power-up bar and game-over flow`.

---

## Acceptance (matches the spec's acceptance section)

- Endless mobile-web session: retractable drag with backtrack, merges resolve by the sum-to-tier rule and score correctly, board collapses + refills, game ends when no move remains.
- All three power-ups work, unlimited.
- Drag/merge feel meets the presentation requirements.
- Core logic (connect, merge, gravity/refill, move-availability, power-ups) covered by Vitest independent of Phaser.
