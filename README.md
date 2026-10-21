# Deterministic Blackhole summaries for Pi Pocket

This standalone adapter replaces only ordinary sessions' compaction summaries and adds one read-only tool, `blackhole_recall`, that reads the originals back. It calls the real `pi-blackhole@0.5.11` `compileSegment` compiler in a bounded worker. It does not load Blackhole's package entry, memory runtime, model workers, or CLI tools.

## Status

- The four deployment files are installed in `~/.pi-pocket/extensions/`. The owner enabled `blackhole.ts` in Pocket.
- The installed `blackhole.ts` is the version before recall. The local copy adds `blackhole_recall` and is not deployed yet.
- The three other deployment files are unchanged and match the installed copies.
- Check the state with `shasum -a 256` on each file here and in `~/.pi-pocket/extensions/`.

## Install

1. Review `blackhole.ts`, `_blackhole-worker.js`, `_blackhole-compiler.js`, and `THIRD_PARTY_LICENSES.md`.
2. After the owner approves installation, copy those four files into the data folder's `extensions/` directory. The default data folder is `~/.pi-pocket`.
3. In Pi Pocket, open **Menu → Extensions**.
4. Turn on `blackhole.ts`.
5. In an ordinary test session, compact a sufficiently long conversation.

The module starts disabled. `_` helper files are not extension modules. A fresh installation needs no restart.

## Update

1. Run the tests.
2. After the owner approves, copy only the changed files into `~/.pi-pocket/extensions/`.
3. If you changed only `blackhole.ts`, Pocket reloads the module. No restart is needed.
4. If you changed a `_` helper, restart through the owner's menu before you use that change.
5. Compare SHA-256 hashes of the local and installed files.

To stop future use, turn off `blackhole.ts` in **Menu → Extensions**. Stored summaries remain. Ordinary sessions then use Pocket's native model summarizer again.

## What stays native

The adapter installs one `CompactionTask.beforeCompact` hook and one tool, `blackhole_recall`. Pocket still selects the replaced prefix and the verbatim retained tail. Pocket still stores the summary, manages tasks, and handles resets, forks, and restarts.

The adapter checks `host.pip.ownerOf` before inspecting the source. PiP returns no decision and keeps its special summarizer. A missing ownership API causes a visible decline rather than a guess.

Blackhole's CLI settings are not Pocket settings. This adapter matches deterministic extraction, no Blackhole memory workers, and append-style summary preservation. It does not import or change the CLI configuration.

These CLI options are not reproduced:

- `compactAfterTokens: 140000`. Pocket retains its native trigger threshold.
- `midRunCompaction: off`. Pocket retains its native mid-run behavior.
- `tailBehavior: pi-default`. Pocket retains its own cut and tool-result ordering, not the CLI implementation.

Pocket exposes compaction policy as a harness-wide settings getter. A summary hook cannot safely implement per-session timing changes. No global settings or Pocket core files are changed.

Pocket's own approved lessons and memory tool remain unchanged. `memory: false` here means no Blackhole observational-memory runtime, not disabling Pocket's separate memory feature.

## Append behavior and limits

On the first compaction, the compiler receives the selected messages. On later compactions, the adapter identifies the actual `CompactionEntry`, unwraps its summary, and appends only a fresh compiled segment. It preserves previous native prose and deterministic segments byte-for-byte. It never recompiles older summaries.

This implements append-style text preservation in Pocket's existing summary entry. It does not implement Blackhole's CLI segment ledger, coverage metadata, rebasing, or budget recovery. The upstream `compile` merge path can discard native prose and cap older sections, so this adapter deliberately uses `compileSegment` instead.

The one exception to byte-for-byte preservation is the adapter's own recall note. Each summary ends with exactly one note. On append, the adapter removes the note only when it is the exact trailing text, then adds it after the new segment.

## Recall

Brief-transcript lines end with refs such as `(#4182)`. Each number is the Pocket `EntryId` of the original message, not a positional index. No ledger is needed: entry ids are stable across restarts and forks.

The hook maps each summarized message to its entry by object identity. Pi Durable builds `messages` from the same frozen objects as each entry's `model`. A message that gets no ref:

- a message that a context edit replaced,
- a tool result that Pi Durable synthesized for a missing call,
- a message that two entries share,
- an earlier summary marker.

No ref is better than a wrong ref.

`blackhole_recall` takes these parameters:

- `ids`: up to 20 entry ids. Returns each entry's model text in full: user and assistant text, tool calls with arguments, and tool results. Thinking is never returned. Images show as `[image]`.
- `offset`: a character offset, to page an entry that is longer than the budget.
- `query`: words to find. Search is literal and case-insensitive, and every word must match. Regex syntax is plain text, so a pattern cannot hang the server. Search covers only entries older than the active head marker's `head`, newest first, 10 per page, at most 10,000 entries.
- `page`: the results page of a query.

A response holds at most 24,000 characters. `ids` and `query` together share that budget. A truncated entry ends with the exact `offset` for the next call.

The tool reads through `tx.scanEntries` with the calling conversation's id. Pocket's storage returns only entries visible from that conversation: its own, and those a fork inherited up to its fork point. Another session's id returns "not found". Reads use separate small commits of 256 entries, so a search never holds the Session line for long. The tool is `replay: "safe"` and declares `readOnlyHint`, so plan mode allows it.

If the owner turns the module off, stored summaries keep their refs and note, but the tool is gone. A call then fails as an unknown tool. Context stays correct.

Deterministic extraction is lossy. Upstream rules clip text and cap the fresh brief transcript. The adapter does not interpret custom compaction instructions and reports that limitation when instructions are supplied.

Each compilation has these bounds:

- Source strings and object keys total at most 8 MiB characters, with a 100,000-value traversal limit.
- Compilation runs in a separate worker with a five-second deadline and a 128 MiB old-generation heap limit.
- The resulting cumulative summary contains at most 1 MiB characters.
- Pocket's token estimator must report fewer tokens for the wrapped replacement summary than for the replaced non-system messages. System definitions are reinserted and do not count as savings.

These are character and estimated-token checks, not exact provider token counts or a complete model context-window guarantee. Main-thread validation, source cloning, and estimation remain bounded work. Append growth eventually reaches a limit. The adapter declines then rather than deleting older segments silently.

Empty output, compiler errors, worker failures, malformed previous markers, excessive size, and non-shrinking summaries return `{ decline: true }`. A warning reaches the session. Context stays unchanged. There is no model fallback. An overflow can therefore remain unresolved and require the owner to reset, fork, or disable the adapter deliberately.

Another extension that makes an earlier compaction decision can supersede this hook. The adapter adds no prompt sections, durable documents, filesystem reads, subprocesses, or network calls. Its only tool reads the session's own entries. The worker uses plain JavaScript and deliberately does not inherit Node command-line loaders or eval flags.

## Build and check locally

The local `node_modules` symlink points at Pocket's existing dependencies. It is only a development convenience, not a deployment file. No installation is needed.

```sh
cd /Users/theskumar/code/pi-pocket-blackhole
node build.mjs
node --test blackhole.test.ts
node --check blackhole.ts
node --check _blackhole-worker.js
node --check _blackhole-compiler.js
```

`build.mjs` uses `/Users/theskumar/code/pi-pocket/node_modules/.bin/esbuild`. It bundles the compiler dependency graph, not Blackhole's entry point. It resolves the `pi-tui` export directly to its original `dist/utils.js` implementation to exclude unrelated terminal initialization. The output has 21 contributing source files and only `node:path` runtime imports. `compiler-provenance.json` records source hashes and byte contributions.

The test suite uses Pocket's real `openApp` helpers and drop-in loader with an isolated data folder, auth folder, settings, and scripted faux provider. Temporary files stay under this directory's `.test-tmp/`. No request reaches a real model provider.

The suite has 13 tests. The compaction tests cover compiler parity, eval launch, previous native prose, append preservation, fresh-only recompilation, PiP exclusion, missing APIs, error and empty output, size bounds, a multi-megabyte tool result, non-shrinking output, notices, no model fallback, bundle dependencies, real drop-in loading, retained-tail equality, restart, fork, reset, and PiP's unchanged model summarizer.

The recall tests cover identity mapping and fail-closed refs, a single trailing note across appends, full expansion, offset paging, hidden thinking, literal paged search limited to compacted entries, and the shared budget. A real-Pocket test compacts a session and checks that every ref is a real entry id of that session. In the same test, the scripted model calls `blackhole_recall` by id and by query, a fork recalls inherited entries, and an unrelated session gets "not found".

`test-output.txt` records the last run. Full Pocket lint and TypeScript checks were not run here. This checkout has no installed `tsc`, ESLint, or Prettier executables. No packages were installed and no repo-wide formatter was run.

## Files

Deploy only `blackhole.ts`, `_blackhole-worker.js`, `_blackhole-compiler.js`, and `THIRD_PARTY_LICENSES.md` after approval. Keep `build.mjs`, `compiler-provenance.json`, `blackhole.test.ts`, `package.json`, `test-output.txt`, and `CONTEXT.md` here for maintenance and review. `HANDOFF.md` and `REVIEW.md` belong to the coordinating agent. `REVIEW.md` predates recall and still says there is no recall tool. `CONTEXT.md` lists durable facts for later maintenance.
