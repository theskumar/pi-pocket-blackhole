# Acceptance review

Scope: deterministic Blackhole compiler only, memory disabled, append summaries. Pocket's native triggers and recent-tail selection remain in force. The CLI's 140k threshold and idle-only scheduling are not ported because the drop-in hook cannot safely change harness-wide policy.

Required checks:
- No import of the full Blackhole extension or memory runtime.
- No model calls or observational worker startup.
- PiP bypassed before processing or failure handling.
- Previous native and deterministic summaries preserved as opaque history.
- Repeated compaction appends only newly removed messages.
- No invented recall tool or positional source references.
- Empty, failed, or oversized output declines compaction, without LLM fallback.
- Native tail retention, reset, and persisted history remain correct.
- Install through drop-in files only, left disabled. Never edit config or SQLite.
- Preserve upstream license and identify compiler version.

Baseline before adapter installation: Pocket's test/dropins.test.ts and test/pip-compact.test.ts passed, 12/12 tests. Existing package-lock.json modification in Pocket predates this task and must remain untouched.

Main review checks:
- Adapter, compiler, and worker passed Node syntax checks.
- Bundle provenance contains 21 contributing inputs and only node:path runtime imports. No memory runtime or worker model code.
- Independent compiler smoke test produced identical output twice, with no unsupported recall tool or numeric source references.
- Full unmodified Pocket suite was interrupted before completion. An isolated branches.test.ts baseline failure reproduces on macOS because git returns /private/var/... while the test expects /var/.... No Pocket source was changed.
- Worker invocation from a node --input-type=module eval initially inherited an invalid flag. Fixed with explicit worker execArgv and covered by regression test.
- Main independently reran all nine adapter tests, including the isolated real Pocket loader and restart/fork/reset/PiP integration. All passed. Syntax checks passed again.
- Main independently reran Pocket drop-in and PiP suites. All 12 tests passed.
- All 21 recorded contributing source hashes match the installed source files.
- At initial review, the live extensions directory was unchanged. After review, the owner approved installation. All four deployment files were copied with matching SHA-256 hashes, and the owner confirmed enabling the extension. No Pocket restart or push was performed.
- Full Pocket lint and TypeScript checks were unavailable because their executables are not installed.

## Recall review (0.2.1)

The 0.1.x scope above excluded recall. Version 0.2.0 added `blackhole_recall` with `(#N)` entry-id refs. Three independent reviews (security, correctness, maintainability) then found no cross-session read. Version 0.2.1 fixes their findings:

- Recall stops at the newest reset for ids and search. Before, it reached content that a reset had removed from context.
- Each entry comes back between markers with a random key per call, under a quoted-data preamble. Before, recalled text could fake `[user]` turns.
- Refs are `(#eN)`. Before, `(#N)` collided with GitHub refs such as `(#123)` in commit subjects.
- Recall applies context edits and drops aborted, error, and deferred assistant messages, as Pi Durable does.
- Search skips system prompts and role labels, matches escaped literal patterns on the original text, and pages with `before` instead of `page`.
- Bounds are exact: the 24,000-character response limit holds with 20 truncated ids, and the 10,000-entry search limit is checked per entry.
- The trailing note is replaced in any wording, and it says to call the tool only if it is available.
- New tests cover each fix, a fork that must not see the parent's later entries, merged refs, and the reset boundary in real Pocket. 18 tests pass, also in two parallel runs.
