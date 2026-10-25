# Number-Merge Web Game (v1) — Design

**Date:** 2026-10-25
**Status:** Draft for approval

## Intent & why

Build a web version of a "Number Match"-style grid puzzle. The single most
important thing to get right is the **tactile feel of dragging a chain of
blocks and watching it merge** — the moment-to-moment feedback of the drag,
not progression or meta systems. Everything else serves that moment.

The game logic should match the original app (an iOS Unity/IL2CPP game we
reverse-engineered), so the rules below are taken from that game's actual
code, not invented.

## Goals

- A satisfying, responsive **retractable drag-to-select** interaction.
- Faithful reproduction of the original's **connect rule, merge math,
  scoring, and board lifecycle**.
- An **endless** single-board loop: play until no moves remain.
- Three **power-ups** (Hammer, Magnet, Swap), unlimited use.
- Runs well on **mobile web** (touch-first), small bundle, fast load.

## Non-goals (v1)

- Levels, objectives, targets, timers, or a campaign.
- Meta-progression, currencies, daily challenges, leaderboards, accounts.
- Ads / in-app purchases / any monetization.
- Native builds. (Web only.)
- Matching the original's exact art/skin; we need the mechanic, not the assets.

## Anti-goals (failure even if it technically works)

- A drag that feels laggy, imprecise, or unforgiving — if backtracking or
  chain extension feels wrong, the project has failed its core purpose.
- Merges that resolve in a way the player can't predict or feel.

## Core rules (from the original — authoritative)

**Board**
- Grid is **5 columns × 7 rows** (every sampled level in the original used
  5×7). Seeded at start with low-tier blocks.
- Each block has an integer **tier ≥ 1**. Its **value = `2^tier`**.
  (Verified: `NumberUtils.ConvertTierToNumberForAlgorithm` = `BigInteger.Pow(2, tier)`.)
- Early spawn tiers roughly 1–6; **spawn tier range scales up** as the player
  reaches higher tiers (original's `min/maxSpawnTier` grows with
  `maxReachTier`). v1 may use a simple scaling rule (builder's call,
  documented below).

**Drag selection (one continuous touch)**
1. Touch-down on a block → it becomes the chain **head** (highlights; a line
   anchors to its center).
2. Drag into an **orthogonally/diagonally adjacent** block that is a **valid
   next link** → it joins the chain (highlights; line segment locks between
   centers).
   - Adjacency: the original uses grid-node neighbors
     (`GetBlockItemGridNode`). v1 uses **8-way adjacency** (orthogonal +
     diagonal) unless the builder finds the original restricts to 4-way;
     either is acceptable for feel — see "Left to the builder".
   - **Valid next link** (comparison is against the **immediately previous
     block** in the path, step by step — not against the head):
     - the entered block's tier is **equal to** the previous block's, **or**
     - **exactly one tier greater (+1)** than the previous block's — **but
       only once the chain already holds ≥ 2 blocks.**
     - Consequence: the **first pair must be equal.** You can't start a chain
       with a +1 step (e.g. 3→4 alone is invalid); you start with an equal
       pair and may then climb (3→3→4→5 is valid). This lets tiers ascend
       step-by-step after an equal opening.
     (Verified in native `CheckBlockItemsMerge` @0x36E52C0: reads each
     block's number field `+0xB4`; `if (prev == next) return true`; else the
     `+1` branch is `ccmp prev+1, next` gated on `list.Count > 1`, so +1 is
     unavailable on the opening pair.)
   - The block must not already be in the path (except the backtrack case).
3. **Backtrack:** moving the finger back onto an **already-selected earlier
   block** rewinds the path to that block — every block selected after it is
   de-selected and its line segments removed.
4. **Touch-up** commits the selection.

**Merge (on commit)**
- A committed chain is valid if it has **≥ 2 blocks**. (Verified:
  `CalculateBlockItemsTier` requires `list.Count >= 2`.)
- If invalid/too short, the chain just clears with no merge, no score.
- If valid: all chained blocks are consumed. Compute
  **`total = Σ 2^tier`** over every consumed block. (Verified:
  `CalculateMergeScore` sums `2^tier` per block as a `BigInteger`.)
  - The **merged block** appears at the **last block selected** (chain end),
    at tier **`ceil(log2(total))`** — i.e. the **smallest** tier whose value
    `2^tier ≥ total` (the total rounded UP to the next power of two).
    (Corrected against in-game observation: an earlier read had this as
    floor; the original rounds up. E.g. three 64s → 192 → **256** = 2^8;
    three 32s + a 64 → 160 → **256** = 2^8; three 8s → 24 → **32** = 2^5.
    An exact power of two is unchanged: two 8s → 16 = 2^4.)
    - **No value is lost** — rounding up is why. (Earlier drafts said leftover
      was discarded via floor; that was wrong.)
  - **Score** for the move = `total`, the full summed value, added to the
    running score.
  - The **highest tier reached** (which drives spawn-tier scaling) updates
    only when a merge produces a strictly higher tier than before — it is
    **monotonic, never decreases** (verified: `ChangeMaxReachTierIfNecessary`
    / `...IfNecessary` family only raise their value).
  - All other consumed cells become empty.

**Board lifecycle after any clear (merge, Hammer, Magnet)**
- Remaining blocks **gravity-shift within their column** to close gaps.
  (Verified: `SortBlockItemListByColumn` + `SortBlockItemListByShiftDirection`
  + `GetAvailableShiftGridNode`.)
- Empty cells then **refill with new blocks entering from the top**
  (`SpawnRandomBlockItem` relative to `GetTopRightGridNode`), using the
  current spawn-tier range.

**Game over**
- When **no valid move exists** anywhere on the board (no adjacent pair that
  is equal or +1). The original scans this via `FindAllMatches` /
  `IsAnyMatchMoveAvailable` (recursive flood-fill over valid-neighbor links).

## Power-ups (unlimited in v1; bottom-bar buttons, tap-to-target)

Interaction: three buttons at the bottom. Tapping one enters a **targeting
mode** for the next tap(s); tapping the button again cancels. After the
power-up resolves, the board runs the standard shift + refill.

- **Hammer** — tap one block → destroy it. (Verified: `ProcessHammerPowerUp`
  removes a single targeted block.)
- **Magnet** — tap one block → gather **all other blocks of the same tier**
  on the board and merge them into the tapped block, resolving tier/score by
  the same sum-to-tier rule as a drag-merge. **Only usable when ≥ 2 blocks of
  that tier exist** (verified: `CheckIfMagnetIsUsable` returns
  `FindBlocksWithTier(tier).Count > 1`). The gathered blocks animate toward
  the tapped cell and the merged result lands **on the tapped cell** (my
  call — reads as "pull everything to here"). If the tapped tier has only
  one instance, the tap is rejected with soft feedback (not consumed).
- **Swap** — select **two** blocks → swap their grid positions (no merge;
  repositioning only, to set up a chain). (Verified: `ProcessSwapPowerUp` →
  `SwapBlockItemsByBlock`.) **Any two distinct blocks are valid** (including
  adjacent); the swap need not create a move — it's a free repositioning tool
  (my call, consistent with unlimited supply). Tapping the same block twice
  cancels.

**Power-up interaction edge cases (my calls):**
- Power-up buttons are only live when **not mid-drag.** Starting a drag
  cancels any pending targeting mode; a tap on the board during targeting
  mode targets the power-up, it does not start a chain.
- After Hammer/Magnet resolve, the board runs the standard **gravity-shift +
  refill**. Swap does not shift or refill (positions just exchange).
- Entering targeting mode highlights eligible targets where cheap (e.g.
  Magnet dims tiers with only one instance); exact affordances are builder's
  call on feel.

## Feel / presentation requirements (the point of v1)

These are requirements, not polish-if-time:

- Line follows the finger smoothly; selected blocks highlight (scale/glow)
  the instant they join; de-select instantly on backtrack.
- Merge has a clear **snap/pop**: blocks travel to the merge cell, the result
  block pops in with a scale bounce, number counts/flashes to its new value.
- Score counts up (not instant jump) on a merge.
- Big chains get extra feedback (e.g. intensity scales with chain length —
  shake/particles). The original has "Good/Great/Excellent/Amazing" combo
  reaction tiers; v1 can mirror that with escalating feedback (builder's
  call on thresholds/style).
- Invalid commit (too short) clears with a soft, non-punishing feedback.

## How it gets made (decided)

- **Phaser 3 + TypeScript.** Phaser handles rendering (WebGL), pointer input,
  tweens, scenes, audio; chosen for being a purpose-built 2D web game engine
  that maps directly onto this game's needs with a small bundle and good
  mobile-web performance.
- **Game logic in plain TypeScript**, engine-agnostic (board model, connect
  rule, merge math, shift/refill, move-availability, power-ups), so it is
  unit-testable without Phaser and could be reused on another renderer.
- Build tooling: a standard Vite + TS setup (builder's choice of exact
  versions).
- Values use regular JS numbers, not BigInteger: `2^tier` fits in a JS safe
  integer until tier 53, far beyond reachable play; score may exceed that
  over a long session, so the score accumulator should use `BigInt` (or
  cap/He-notation display) — builder's call, documented.

## Seeding & solvability (my calls)

- **Initial seed:** fill the whole 5×7 board with low-tier blocks (the
  original's sampled levels seed uniformly low — mostly tier 1). The seed is
  **guaranteed to contain at least one valid move** (if a random fill
  doesn't, re-roll it). This avoids a frustrating instant dead-end on
  launch.
- **Refill** after shift uses the current spawn-tier range and is **plain
  random** — it does *not* guarantee a move exists. If a refill genuinely
  leaves no valid move anywhere, that is **game over** (see below). Dead
  boards are rare at 5×7 with multiple blocks per tier, and letting them end
  the run is what "endless until no moves" means.

## Session persistence (added after v1 build, by user request)

- **Auto-save + auto-resume, this browser only (`localStorage`).** The board,
  score, and highest-tier-reached are saved after every move and power-up and
  reloaded automatically on page open — closing and reopening continues where
  you left off. Transient state (drag path, power-up targeting) is not saved.
- **"New game"** overwrites the save with the fresh board. **Game over**
  clears the save, so a reload after a dead board starts fresh rather than
  dropping back onto the game-over screen.
- Save is versioned; a save from an incompatible version or any corrupt data
  is discarded (falls back to a fresh game). All storage access is wrapped so
  a browser with storage blocked/full simply plays without persistence.
- Still **no cross-device sync and no accounts** (that remains out of scope).
- (Original v1 call was "no persistence"; superseded here.)

## Left to the builder (sensible-default calls)

- **Adjacency 4-way vs 8-way.** Default **8-way** (orthogonal + diagonal). If
  quick inspection of the original's grid neighbor logic shows 4-way, use
  that instead. Does not change the data model.
- **Spawn-tier scaling formula.** A simple monotonic rule tied to the highest
  tier reached (e.g. min/max spawn tier each rise by 1 per N tiers reached).
- **Combo-feedback thresholds** (chain length → feedback intensity) and exact
  tween timings/easings — tuned for feel.
- **Score type/display** (BigInt vs capped) as above.
- **Exact grid pixel sizing / responsive layout** for phone and desktop
  widths.
- **Reshuffle-on-deadlock vs. game-over**: default to **game-over** (matches
  "endless until no moves"); the original has a revive/reshuffle path that is
  out of v1 scope.

## Acceptance (v1 is done when)

- You can play an endless session on mobile web: drag chains (with
  backtrack), merges resolve by the sum-to-tier rule and score correctly,
  board shifts + refills, and the game ends when no move remains.
- All three power-ups work as specified, unlimited.
- The drag/merge feel meets the presentation requirements above.
- Core logic (connect rule, merge math, shift/refill, move-availability,
  power-up effects) is covered by unit tests independent of Phaser.
