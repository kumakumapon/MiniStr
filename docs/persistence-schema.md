# Persistence schema policy

## Three independent versions

- Save/replay `schemaVersion: 4` is the container format. Readers accept 1 → 2 → 3 → 4 using named, adjacent, pure migrations, then strict validation. Unknown/future versions fail without writing.
- `GameState.ruleVersion` controls game mechanics (classic, logistics/modern, decision rules, balanced opening/round-end scores, and v5 dual weapons). A container migration never silently enables a newer rule.
- `GameState.scenarioSnapshot` is a validated, canonical ScenarioData definition. New matches embed it so a catalog rename, replacement, deletion or another browser does not change the rules of that match. It is a definition snapshot, not a signature or proof of authorship.

Campaign progress remains schema 3. Custom catalog schema remains unchanged with an optional validated `history` array. Backups have their own schema 1; they are not replays.

## Validation order and budgets

All JSON boundaries enforce UTF-8 size, iterative depth (64) and node count (200,000) before migration or cloning. Then they validate keys/types/ranges, reconstruct the canonical initial state, replay legal commands and compare the recorded final state/summary. A snapshot goes through the same scenario parser and never registers an imported scenario globally.

Weapon loadouts are derived from the canonical unit registry, with a primary weapon and at most one secondary weapon. New matches use `ruleVersion: 5`; classic and v2–v4 matches keep their original single weapon, damage, counters and seeded outcomes. The primary magazine remains `Unit.ammo`; v5 adds optional `Unit.secondaryAmmo`. Omission means a full magazine. Present reserves must be safe integers from zero to the corresponding weapon capacity; a secondary reserve is rejected for older rules or units without a secondary weapon. Attack commands optionally record `weaponSlot: 0 | 1`; omission selects the strongest legal weapon automatically, while an explicitly unavailable, empty, moved indirect or out-of-range weapon is rejected. Only the fired weapon spends a round. Counterattacks choose a legal direct weapon after the actual damage roll. Facilities, APC supply and merging restore/combine both magazines within their individual capacities. Enemy secondary ammunition is hidden just like primary ammunition. The save/replay container remains schema v4: the recorded game rule version controls the mechanics and older apps safely reject v5 states. Spectator camera choices are viewer-only state and do not enter saves, replays or CPU decisions.

Save/replay/editor/catalog inputs are limited to 1,000,000 bytes; campaign data to 64,000; complete backup to 16,000,000. Existing command-count and board schema limits remain, but replay work is additionally limited to:

`commands × (board width × height + initial units × 4 + 1) ≤ 50,000,000`

This is a deterministic admission budget, not a wall-clock guarantee. Newly started editor scenarios support at most 32×32 and 128 initial units. Legacy data outside a computational budget fails with an explicit error and remains stored; it is never silently truncated.

## Catalog compatibility

Overwrite/delete archives the previous validated definition in the same catalog write. An old save without a snapshot can resolve against that history only when its initial state equals the canonical state of that revision. Up to 256 revisions and the catalog byte budget are retained; reaching either limit refuses the write instead of deleting revisions.

Definitions lost **before** this protection was installed cannot be reconstructed from a map ID alone. Preserve an older exported catalog/backup. New schema-4 snapshots are portable without that catalog.

Built-in map revisions from before the wide-map update are retained separately from custom history. Pre-snapshot saves/replays are matched against their canonical initial state and upgraded with that old definition; an edited opening is rejected. Optional `ScenarioData.secondPlayerBonus` is a bounded nonnegative integer (maximum 1,000,000), recorded in snapshots and applied once at creation. Omission keeps historical funds. Rule versions 2 and 3 retain their original upkeep, force limits and immediate scoring; version 4 defers score victory until blue closes a round and caps each side at 64 units.

## Storage and recovery

The browser adapter catches a denied storage getter/read and keeps a session-only copy, with a visible warning. Quota/write failure is reported to callers. Payload/index writes and removals stage previous values and roll back on failure; rollback failure is reported too (localStorage cannot offer real database transactions).

The list displays valid, corrupt, missing and orphaned entries. Only valid data can resume. Named IDs cannot impersonate reserved manual/auto slots. The cache key includes raw data, metadata and catalog generation; loads always validate again. A storage event pauses processing and blocks further writes until reload, avoiding silent last-writer replacement.

Backups contain all MiniStr keys and exclude other applications. Export retains corrupt raw entries for recovery; automatic restore accepts only fully validated supported entries, so a corrupt export may require manual repair. Restore stages a candidate catalog and all saves before transactionally replacing keys. It does not change the running match. No network upload is performed.

Loading commits live state, campaign context and timer changes only after successful validation. Async imports are discarded if the match or screen changed while the file was being read.

## Migration tests

Keep historical schema fixtures, custom revision overwrite/delete/reload tests, forged initial/final-state rejection, deep legacy JSON, missing/orphaned slots, index quota rollback, denied storage and failed-load UI preservation. Never migrate by writing over an unvalidated original.
