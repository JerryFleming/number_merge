# First-run tutorial (recovered from the original)

Source: Cpp2IL decompilation of the original Number Match iOS binary
(`NumberMatchGameplayTutorialController.cs`, `TutorialStates.cs`,
`NumberMatchTutorialStepScriptableObject.cs`) plus the UI sprite atlas.

## How the original works

- **State machine** (`TutorialStates`): `None → First → Second → Third →
  Completed`. Gated by `ShouldShowTutorial()` — shown only to a brand-new user.
- **Per step** (`ProcessToFirst/Second/ThirdTutorialState`):
  1. `GenerateTutorialStep(index)` lays out that step's scripted "tutorial
     blocks" (a `List<{loopGridPoint, tier}>` serialized in a
     ScriptableObject), releasing them immediately.
  2. `SetTutorialMaskStatus(true)` dims everything except the tutorial blocks
     (`MaskTutorialBlockItems` / `UnmaskTutorialBlockItems`).
  3. Title + description fade in (`SetTutorialTitleText` /
     `SetTutorialDescriptionText`, from localization; canvas DOTween show/hide
     sequences).
  4. `StartTutorialHandSequence(blockPositions, moveDuration, Ease.Linear)`
     loops the `tutorial-hand` sprite dragging across the demo block centers.
  5. It **waits for the player** to perform the move; a wrong move triggers
     `SetDetectBlockItemFailedUI()`. Success → `IncreaseCurrentTutorialState` →
     `ProcessToNextTutorialState`.
- Separate, later power-up tutorials (`CheckPowerUpTutorial`, `PutHandOnPowerUp`,
  hammer/swap/magnet routines) fire the first time each power-up becomes
  relevant — these are out of scope for the first-run intro.
- **Hand sprite**: `tutorial-hand` in `sactx-5-2048x2048-...-ui-sprite-atlas`
  (rect 1500,0,171×250; pivot ~0.35,0.89 near the fingertip). Extracted to
  `src/assets/hand.png`.

The step titles/descriptions are localization keys resolved at runtime and are
not present in the binary, so the clone uses faithful English copy for the same
rules.

## Clone implementation

- `src/core/tutorial.ts` — three scripted steps (pure, tested): each carries a
  full scripted board and a demo drag path, engineered so the demonstrated move
  is valid under the real connect rule (equal, or +1 once the chain ≥ 2):
  - Step 1 — merge two equal blocks (4 + 4 → 8).
  - Step 2 — chain into a bigger block (4 → 4 → 8, the last being +1).
  - Step 3 — use a power-up (points at the power bar; completes on any tap).
- `src/phaser/Tutorial.ts` — the overlay: a full-screen dim with holes punched
  over the demo cells via an **inverted geometry mask** (spotlight), a looping
  pointing hand (`tweens.chain` across the demo centers; a bob over the power
  bar on step 3), title/description/step banner, and a Skip control.
- `BoardScene` loads each step's scripted board, restricts input to the step's
  demo cells (`tutorialAllows`), advances on a completed demo merge, and marks
  `nm_tutorial_done` in `localStorage` so it never runs again. It runs only for
  a brand-new player: no saved board **and** no done-flag.
