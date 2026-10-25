# Persistence schema policy

## Three independent versions

- Save/replay `schemaVersion: 4` is the container format. Readers accept 1 → 2 → 3 → 4 using named, adjacent, pure migrations, then strict validation. Unknown/future versions fail without writing.
- `GameState.ruleVersion` controls game mechanics (classic, logistics/modern, decision rules, balanced opening/round-end scores, and v5 dual weapons). A container migration never silently enables a newer rule.
- `GameState.scenarioSnapshot` is a validated, canonical ScenarioData definition. New matches embed it so a catalog rename, replacement, deletion or another browser does not change the rules of that match. It is a definition snapshot, not a signature or proof of authorship.

Campaign progress uses schema 4, preserving unlocked operations and best grades from schemas 1–3 and recording victorious survivors for experience inheritance. Older apps do not accept schema 4 campaign progress. Custom catalog schema remains unchanged with an optional validated `history` array. Backups have their own schema 1; they are not replays.

## Validation order and budgets

All JSON boundaries enforce UTF-8 size, iterative depth (64) and node count (200,000) before migration or cloning. Then they validate keys/types/ranges, reconstruct the canonical initial state, replay legal commands and compare the recorded final state/summary. A snapshot goes through the same scenario parser and never registers an imported scenario globally.

Weapon loadouts are derived from the canonical unit registry, with a primary weapon and at most one secondary weapon. New matches use `ruleVersion: 9` (including the v5 weapon rules); classic and v2–v4 matches keep their original single weapon, damage, counters and seeded outcomes. The primary magazine remains `Unit.ammo`; v5 adds optional `Unit.secondaryAmmo`. Omission means a full magazine. Present reserves must be safe integers from zero to the corresponding weapon capacity; a secondary reserve is rejected for older rules or units without a secondary weapon. Attack commands optionally record `weaponSlot: 0 | 1`; omission selects the strongest legal weapon automatically, while an explicitly unavailable, empty, moved indirect or out-of-range weapon is rejected. Only the fired weapon spends a round. Counterattacks choose a legal direct weapon after the actual damage roll. Facilities, APC supply and merging restore/combine both magazines within their individual capacities. Enemy secondary ammunition is hidden just like primary ammunition. The save/replay container remains schema v4: the recorded game rule version controls the mechanics and older apps safely reject unsupported rule versions. Spectator camera choices are viewer-only state and do not enter saves, replays or CPU decisions.

Rule v6 adds `escort` and `withdraw` conditions: `unitIds` are distinct initial IDs (`r1`, `r2`, … or `b1`, …) owned by the condition’s side; `positions` are distinct in-board exits; `required` is a positive integer no greater than the target count. Losing enough designated units to make the objective impossible immediately loses the operation. The `evacuate` command requires an unacted deployed active-side target at an authored exit with no cargo. It moves the actual unit state into optional `GameState.evacuatedUnits`, retaining HP and experience. Evacuated IDs must be unique across both arrays, have a valid original target and exit, and cannot carry active cargo. Evacuation is not destruction or score, and evacuated units remain survivors for grading and veteran records. Classic and v2–v5 states reject the new conditions and evacuation fields/commands.

Predeployment keeps initial slot count and positions fixed. Choices are checked against domain, terrain, the original army-value budget, fixed escort/transport slots and required capturing capability. Unspent budget is applied once in the immutable snapshot’s side-specific opening bonus. Veteran experience is assigned by kind, highest first, one-to-one. The UI always rebuilds previews from the immutable default operation so repeated edits do not accumulate funds. The selected scenario snapshot is the canonical initial state; loading a saved match never opens deployment editing. Campaign schema 4 and the original ten-stage progression are unchanged.

Save/replay/editor/catalog inputs are limited to 1,000,000 bytes; campaign data to 64,000; complete backup to 16,000,000. Existing command-count and board schema limits remain, but replay work is additionally limited to:

`commands × (board width × height + initial units × 4 + 1) ≤ 50,000,000`

This is a deterministic admission budget, not a wall-clock guarantee. Newly started editor scenarios support at most 32×32 and 128 initial units. Legacy data outside a computational budget fails with an explicit error and remains stored; it is never silently truncated.

## Rule v7 and standalone records

Rule v7 introduced reconnaissance and control, including all v6 evacuation and v5 weapon mechanics. Older rule versions retain their sight, CPU withdrawal decisions and outcomes. Container schema 4 and campaign schema 4 remain unchanged.

- `recon` commands contain exactly `type` and an in-board integer `center`. Each army starts with two uses. Optional `GameState.recon` contains exactly `remaining: {red, blue}` (integers 0–2) and distinct `centers`. Active centers cannot exceed that army's spent uses. Their Manhattan radius-three sight applies only to the active army and is cleared when the turn passes; remaining uses persist. V1–v6 reject recon state/commands. Replay perspective never reveals an opponent's scan through an unseen timeline event.
- `control` conditions have property `positions` and a positive target up to 100,000. Both sides must have one identical point set/target, without conventional score goals. Optional `controlScores` accepts only red/blue nonnegative safe integers in v7 control games. Blue closing a round scores ownership once for both armies; equal scores above target continue. Scores saturate at MAX_SAFE_INTEGER. Owners and scores are public; hidden units remain hidden. A normal hold goal still requires its original garrison rules.
- Optional `ScenarioData.battleSeed` is an unsigned 32-bit integer and belongs to the immutable snapshot. Omission means combat seed 1. Generated v1 definitions omit it; v2 derives it from size, sea and generation seed. Saved v1 geometry/armies/seed are never regenerated or replaced when loaded.
- `ministr.operations.records` uses independent schema 1, at most 128 condition records and 384,000 UTF-8 bytes. Each configuration is a bounded canonical scenario snapshot (32,000 bytes). Conditions compare the entire configuration string, rule and difficulty; the short map revision hash is only a display/version aid. Opening grants normalize omitted and zero values. Best turns/losses and a union of achieved challenges update idempotently, without cumulative victory counters. The human/CPU game mode is UI policy; legal command replay validates the result. These local records are user-editable personal progress, not authenticated rankings.
- Only the built-in standalone operations and canonical legal starts qualify. Different starting armies/funds remain separate conditions; old map revisions are retained and labeled. Losses count disappearing friendly units including cargo/fuel losses, excluding merging and evacuation. Initial-unit survival requires their original IDs to remain active, embarked or evacuated. Turn counts subtract the new round number only when blue's end-turn produced the victory.
- Invalid, full or unwritable records return a visible error and preserve existing records. Reset/deletion is explicit. Complete backups validate this key before applying any writes; unrelated save keys remain independent.

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


## Rule v8: depots and field fortifications

V8 introduced depots and fortifications. Existing v7 and earlier matches retain their recorded mechanics, roster and outcomes. Container schema4 and campaign schema4 remain unchanged. Older applications reject unsupported rules or the new unit/terrain kinds.

- `supplyDepot` is capturable property. It participates in capture scores, property-count decisions and authored control/hold conditions, but supplies no income, HP repair or production. At friendly turn start, its tile and Manhattan-distance-1 neighbors supply friendly ground units' fuel and all weapon magazines. Ground transport cargo in range is included. Existing facility/APC service remains intact.
- `engineer` requires rule8 for initial states, production and recorded configurations. Legacy states containing engineers, depots or fortifications are rejected.
- `GameState.fortifications` is optional, preserving old initial-state equality. Present data is an array of at most8 entries, each exactly `{position:{x,y},owner}`. Coordinates must be safe integers in the board, refer to plains, and be unique; each army may own at most4. No enemy ground unit may occupy a retained site.
- `{type:'fortify',unitId}` is an independent command with no extra fields. An active friendly deployed engineer must be unmoved and unacted, stand on unfortified plains, have500G available and remain below its cap. Construction pays once and ends movement and action. Failed orders preserve state.
- Owned ground cover adds one defense star, capped at4, with existing HP scaling for forecasts, attacks and counters. Ground entry removes enemy sites along the realized route or at disembarkation, respecting first-contact stops. Aircraft do not remove or benefit from sites. Original terrain and movement costs are preserved.
- Sites are replayed through save/resume, undo and forward/backward seeks. Markers and opponent events do not disclose hidden sites. Supply preview and range controls use friendly sources and are viewer state outside command history.


## Rule v9: temporary bridges

New matches use v9; recorded v8 and earlier matches keep their mechanics and CPU routing. Container schema4 and campaign schema4 are unchanged.

- Optional `GameState.bridges` contains at most4 entries, exactly `{position:{x,y},owner}` with an army owner, safe integer coordinates, unique positions and at most2 entries per army. The original tile must be sea with an opposite pair of vehicle-passable land banks. Bridges cannot be chained. Old rules reject this field, including an empty array.
- `{type:'bridge',unitId,destination:{x,y}}` accepts no extra fields. An active deployed friendly engineer must be unmoved/unacted, on one bank of the adjacent one-cell water gap, with1000G and available construction capacity. The destination must be visible, empty and without a bridge. Success pays once and ends both movement and action; failures preserve state.
- The underlying sea remains unchanged. Ground movement costs1 on a bridge; naval and air movement keep their original cost. Both armies can cross, including unloaded ground cargo. Shared occupancy is still forbidden. Bridges remain until the match ends; they add no defense, income, repair or ownership-based supply.
- Completed bridge positions and bridge-construction timeline events are public. Enemy occupants remain subject to fog. Routing, first contact, transport, replay seek and spectator rotation use the same state-aware movement rules.
- Save loading reconstructs bridges through legal command replay; undo/replay seek removes or restores them at the correct command. No static bridge field is added to editor scenario data: authored water gaps and engineers permit construction during play.
- The optional generator preset `frontline` emits `generated-v3-frontline-{size}-{sea}-{seed}` and stores the entire definition in the canonical snapshot. The standard preset remains v2; v1/v2 terrain, forces and combat seeds are unchanged. The frontline preset intentionally uses the paired v2 combat seed for controlled comparisons. Generator labels are not a substitute for the saved definition. Share links (`#ministr-gen1/...`, see `docs/share-links.md`) carry only the generator conditions in the URL hash and do not change any storage key or schema: opening one generates in memory, and only an explicit confirmation saves the result through the same custom-scenario path as the title generator.
- The two crossing operations join the standalone record catalog (11 operations). Records retain the canonical configuration, rule and difficulty; campaign progression and historical results are unchanged.

## Daily challenge records (#230)

`ministr.daily.records` is a separate key with its own schema 1. The save container (schema 4), the replay schema, the campaign schema, rule versions and `ministr.operations.records` are unchanged, and generated battlefields are still not part of the operation records.

- Shape: exactly `{ schemaVersion: 1, records }`. Each record has exactly `date` (a real UTC calendar date, `YYYY-MM-DD`, years 2000-2099), `generation` (`d1`), `ruleVersion` (a known rule version), `bestTurns` (integer 1-1000), `bestLosses` (integer 0-1000) and `updatedAt` (a parseable timestamp of at most 40 characters). Dates are unique per generation. At most 60 records and 32,000 UTF-8 bytes; extra or missing keys are rejected.
- Writes keep the newest 60 dates, newest first. Re-recording a date keeps the smaller turns and the smaller losses separately (they may come from different matches); a record made under a different rule version is replaced rather than mixed. A failed write, a full or unreadable store returns a visible error and preserves the existing records. Reset and per-date deletion are explicit.
- Records are user-editable local data, not an authenticated ranking.
- A record is only written for a match whose embedded scenario snapshot is exactly the canonical definition of its date (see `docs/daily-challenge.md`); the stored record itself contains no scenario data, so the date is the only link to the derived battlefield. The derivation per generation is frozen.
- Complete backups validate this key with `parseDailyRecords` before any write and reject a corrupt value without changing existing data. After a restore the in-memory records are reloaded. A backup containing this key is rejected by versions without #230 as an unsupported entry; backups made by older versions restore normally.
- Daily matches use an unsaved scenario definition: saves, slots and replays carry the full scenario snapshot, so they do not depend on the custom scenario catalog (32 entries / 1,000,000 bytes) and never add to it.

## v0.9.6のBGMバックアップ対応

`ministr.music.settings` も全データの書き出し・プレビュー・復元の対象です。1000バイト上限、ミュートは真偽値、音量は有限数0〜1、曲は既知のID、陣営切り替えは真偽値を共通の設定パーサーで検証します。音量・ミュートのみの旧形式や陣営別項目がない形式も受け付け、不足項目を既定値で補います。不正値は他の項目を書き込む前に全体を拒否します。復元後はメモリ上の設定と再生器も再読込します。キー・バックアップschema1・既存の保存形式の変更はありません。

輸送ヘリを使用する新規対局はルールv11（保存/リプレイschema4）。旧ルールv10以下の対局は新兵科を受け付けません。
