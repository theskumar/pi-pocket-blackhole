# Context

Durable facts for maintaining this adapter. One fact per line.

## Project

- Purpose: a Pi Pocket drop-in that replaces ordinary sessions' compaction summaries with deterministic pi-blackhole output, plus a `blackhole_recall` tool.
- Upstream: `pi-blackhole@0.5.11`, MIT, installed at `/Users/theskumar/.pi/agent/npm/node_modules/pi-blackhole`.
- Pocket code: `/Users/theskumar/code/pi-pocket`. Pocket data and live drop-ins: `~/.pi-pocket/extensions/`.
- Deployment files: `blackhole.ts`, `blackhole/compiler.ts`, `blackhole/worker.ts`, `blackhole/THIRD_PARTY_LICENSES.md`.
- Public repo: `theskumar/pi-pocket-blackhole`, MIT. Gallery module name `blackhole`; index repo `TannerMidd/pi-pocket-extensions`.
- Pocket upstream: `TannerMidd/pi-pocket`. pi-blackhole upstream: `k0valik/pi-blackhole`, built on `sting8k/pi-vcc`.
- Owner rules: no edits to the Pocket repo or live data, and no commits, deploys, or restarts without explicit approval.
- Live install (2026-10-21): enabled, pre-recall `blackhole.ts` plus old `_blackhole-*.js` helpers. Deploying 0.2.x needs the `blackhole/` folder first, then `blackhole.ts`, deletion of the old helpers, and a restart.
- Compare installed and local files with `shasum -a 256` before any claim about what is live.

## Build and test

- Test: `npm test` (18 tests, about 10 s, real Pocket helpers, faux provider, no network).
- Build: `npm run setup:build` once (pinned inputs into `build/node_modules/`), then `npm run build`. It rewrites `compiler-provenance.json`.
- `~/.pi/agent/npm/node_modules/pi-blackhole` is 0.5.13 now; never build from it. `build.mjs` refuses versions other than 0.5.11.
- Rebuilt bundle code is identical to the reviewed 0.5.11 bundle; only path comments and the banner changed.
- `node_modules` is a symlink to Pocket's dependencies, for tests only. Tests find Pocket via that link or `PI_POCKET_SOURCE`.
- Never use `PI_POCKET_DIR` for the checkout: Pocket reads it as the data folder, and this shell sets it to `~/.pi-pocket`.
- The test sets `TMPDIR` to `.test-tmp/` and imports Pocket's `test/helpers.ts` before Pocket.
- `H.cleanUp()` deletes the shared test root, so put new real-Pocket tests before the last integration test.
- `tsc`, ESLint, and Prettier are not installed here. `npm run check` (`node --check`) is the only syntax check.
- Gallery entry: `npm run gallery-entry` prints JSON for a pushed commit; hashes come from git, not the working tree.
- Write `test-output.txt` with `node --test blackhole.test.ts > test-output.txt 2>&1` after each change.

## Pi Durable facts

- `beforeCompact` gets `{ reason, entries, messages, firstKept, instructions }`. `entries[0]` is the previous head marker, if any.
- Return `{ summary }` to place a summary, `{ decline: true }` to skip. `undefined` falls through to the native model summarizer.
- `messages` reuse the frozen message objects of `entry.model`, so identity maps a message to its entry.
- Context edits replace messages with new objects, and missing tool results are synthesized. Neither maps to an entry.
- `EntryId` is a global number, stable across restarts. Forks reuse the parent's entry records up to `parent.at`.
- `tx.scanEntries({ conversationId, minEntryId, maxEntryId })` returns only entries visible from that conversation, forks included.
- `tx.entry(id)` is not conversation-scoped. Never use it for access checks.
- `tx.latestHeadMarker(conversationId).head` is the first entry still in context. Older entries are compacted.
- Tools read storage through `api.commit(async (tx) => ...)`. A callback that returns nothing writes nothing.
- `defineTool` returns its argument, so tests can call `recallTool.execute(args, api, context)` directly.
- `annotations: { readOnlyHint: true }` must be added with `Object.assign`. The `defineTool` type lacks it.
- Native summary wrapper: prefix `The conversation history before this point was compacted into the following summary:\n\n<summary>\n`, suffix `\n</summary>`.

## Gallery rules

- Entry files must be `<name>.ts` plus files under `<name>/`. No `_`-prefixed top-level helpers.
- Pocket's Share check treats every `.js`/`.mjs` file as browser code and rejects `node:` imports in it. Server helpers must be `.ts`.
- No absolute import paths, not even `import type` from a Pocket checkout. Inline the needed host type.
- Generated code needs its source and build steps (G11). Keep `build.mjs`, `build/package-lock.json`, and provenance.
- `app.gallery.share('blackhole.ts')` in a test returns Pocket's own draft and problems. The test requires zero problems.
- Shared file order is `blackhole.ts`, then the folder sorted by `localeCompare` (case-insensitive).

## Adapter design

- Refs `(#N)` are Pocket entry ids, passed to `compileSegment` as `sourceIndices`. Unknown or ambiguous messages get `undefined`.
- Use `compileSegment`, never upstream `compile`. `compile` merges, caps, and can drop older native prose.
- Refs are `(#e<id>)`. The compiler gets `REF_BASE + id` (16 digits) because it parses refs with `\d+`; `entryRefs` rewrites only passed ids. GitHub `(#123)` stays literal.
- Each summary ends with exactly one `RECALL_NOTE`. On append, a last paragraph that is one line, starts with `Refs like (#`, and names `` `blackhole_recall` `` is stripped, in any wording.
- Never put a digit ref example such as `(#e123)` in the note. Tests treat every `#e<digits>` as a real ref.
- Recall search is literal and case-insensitive with AND terms. No user regex, to avoid ReDoS on the server thread.
- Recall limits: 24,000 response characters, 20 ids, 1 MiB per entry, 10 hits per call, 10,000 checked entries or 32 MiB per search, 50,000 walked entries, 64 entries per commit.
- Recall walks from the newest entry down, so it sees every context edit in force (newest edit per target wins). It stops after the newest reset (`ResetEntry`, or `head === id`).
- Recall output: a quoted-data preamble, then entries between `<<<key ...>>>` and `<<<key end>>>` with a random key per call. Search hits are JSON-string snippets in one keyed block.
- Search pages with `before` (an entry id), not page numbers, so a compaction between calls does not shift pages.
- Recall drops `aborted`, `error`, and `deferred` assistant messages and hides thinking, like Pi Durable's context.
- PiP sessions are skipped through `host.pip.ownerOf`. A missing API declines visibly.
- Failures return `{ decline: true }` with a session notice. There is never a model fallback.
