# Original spawn-tier formula (recovered from native disassembly)

Recovered from the original "Number Match" `UnityFramework` binary via Cpp2IL,
from `NumberMatchGameplayUtilController`:

- `GetMinSpawnTierFromReachedTier(int tier)` @ RVA `0x36F0694`
- `GetMaxSpawnTierFromReachedTier(int tier)` @ RVA `0x36F0A00`

`tier` here is **maxReachTier** (the highest tier the player has reached), and
the two results become `_minSpawnTier` / `_maxSpawnTier` on the board
controller (`NumberMatchGameplayBlockMatchController`, lines ~7753/7756). New
blocks refill uniformly within `[minSpawnTier, maxSpawnTier]`.

## Baseline / default formula

Both functions select among several branches by **remote config**
(`ConfigController.GetIntConfig(...)`) — the game ships multiple A/B-test
spawn-curve variants. The **default / fallback branch** (taken when the config
is absent or set to the default variant) is, after decoding Cpp2IL's mangled
signed-comparison IL (the `tier ^ 0x10` / XOR-overflow pattern is a signed
`tier >= 16` test):

```
minSpawnTier(reach) = reach >= 16 ? reach - 13 : 1
maxSpawnTier(reach) = reach >= 16 ? reach - 8  : 6
```

So:

- **Before reaching tier 16** (i.e. before a 65536 block): spawn range is a
  fixed, uniform **1..6** (block values 2..64).
- **At/after tier 16**: the window slides up — `min = reach-13`, `max = reach-8`
  — always **6 tiers wide** (`max - min = 5`, inclusive). Floor and ceiling
  rise together as the player progresses.

(The other config variants shift these by small constants, e.g. min = reach-11
/ reach-15 / reach-16 and various clamps `1/4/5/6`, and max = reach-6 / reach-9
/ reach-10 etc. with clamps `6..11`. They are the same shape with different
offsets; the baseline above is the canonical one.)

## vs. our clone (before this recovery)

Our `src/core/spawn.ts` used a builder-default:
`min = 1 + floor(max(0, reach-3)/2)`, `max = min + 3` — a **4-tier** window
whose floor rises every 2 tiers from tier 3. That diverges from the original's
**6-tier** window that stays 1..6 until reach 16, then slides. Matching the
baseline formula above brings refills in line with the original.
