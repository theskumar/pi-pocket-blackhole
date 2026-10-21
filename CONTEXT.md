# Context

Durable facts for maintaining this adapter. One fact per line.

## Project

- Purpose: a Pi Pocket drop-in that replaces ordinary sessions' compaction summaries with deterministic pi-blackhole output, plus a `blackhole_recall` tool.
- Upstream: `pi-blackhole@0.5.11`, MIT, installed at `/Users/theskumar/.pi/agent/npm/node_modules/pi-blackhole`.
- Pocket code: `/Users/theskumar/code/pi-pocket`. Pocket data and live drop-ins: `~/.pi-pocket/extensions/`.
- Deployment files: `blackhole.ts`, `_blackhole-worker.js`, `_blackhole-compiler.js`, `THIRD_PARTY_LICENSES.md`.
- Owner rules: no edits to the Pocket repo or live data, and no commits, deploys, or restarts without explicit approval.
- The owner enabled `blackhole.ts` in Pocket. Installed `blackhole.ts` predates recall (as of 2026-10-21); helpers match.

## Build and test

- Test: `node --test blackhole.test.ts` (13 tests, about 10 s, real Pocket helpers, faux provider, no network).
- Build the compiler bundle: `node build.mjs`. It uses Pocket's esbuild and rewrites `compiler-provenance.json`.
- `node_modules` is a symlink to Pocket's dependencies. Do not install packages.
- The test sets `TMPDIR` to `.test-tmp/` and imports `/Users/theskumar/code/pi-pocket/test/helpers.ts` before Pocket.
- `H.cleanUp()` deletes the shared test root, so put new real-Pocket tests before the last integration test.
- `tsc`, ESLint, and Prettier are not installed here. `node --check` is the only syntax check.
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

## Adapter design

- Refs `(#N)` are Pocket entry ids, passed to `compileSegment` as `sourceIndices`. Unknown or ambiguous messages get `undefined`.
- Use `compileSegment`, never upstream `compile`. `compile` merges, caps, and can drop older native prose.
- Each summary ends with exactly one `RECALL_NOTE`. On append, the note is stripped only when it is the exact trailing text.
- Never put a literal example ref such as `(#123)` in the note. Tests treat every `(#digits)` as a real ref.
- Recall search is literal and case-insensitive with AND terms. No user regex, to avoid ReDoS on the server thread.
- Recall limits: 24,000 response characters, 20 ids, 10 hits per page, 10,000 scanned entries, 256 entries per commit.
- PiP sessions are skipped through `host.pip.ownerOf`. A missing API declines visibly.
- Failures return `{ decline: true }` with a session notice. There is never a model fallback.
