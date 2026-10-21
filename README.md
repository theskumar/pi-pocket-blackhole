# Blackhole compaction for Pi Pocket

A [Pi Pocket](https://github.com/TannerMidd/pi-pocket) drop-in that replaces ordinary sessions' compaction summaries with deterministic [pi-blackhole](https://github.com/k0valik/pi-blackhole) extraction. It makes no model calls. Summary lines carry refs to the original messages, and a read-only tool, `blackhole_recall`, reads those messages back.

- **Deterministic.** The same history always gives the same summary. Compaction costs no tokens and cannot fail on a provider error.
- **Append-only.** Each compaction adds a new segment. Earlier summaries, native or deterministic, stay byte-for-byte.
- **Recallable.** Refs such as `(#4182)` are Pocket entry ids. `blackhole_recall` expands them in full or searches compacted history.
- **Contained.** No network access, no files outside the module, and no reads from other sessions. PiP keeps its own summarizer.

It runs the real `pi-blackhole@0.5.11` `compileSegment` compiler in a bounded worker. It does not load Blackhole's package entry, observational-memory runtime, model workers, or CLI tools.

## Requirements

- Pi Pocket 0.18.0 or later (extension API 1).
- Node.js 24 or later, as Pi Pocket requires.

## Install

The drop-in has four files. Keep their layout:

```text
blackhole.ts
blackhole/compiler.ts
blackhole/worker.ts
blackhole/THIRD_PARTY_LICENSES.md
```

1. Read the module before you install it. The gallery's **Ask Pi to review** can help.
2. Copy the four files into your data folder's `extensions/` directory. The default data folder is `~/.pi-pocket`.
3. In Pi Pocket, open **Menu → Extensions**.
4. Turn on `blackhole.ts`. Drop-ins start off.
5. In an ordinary session, compact a long conversation.

A fresh installation needs no restart.

When the module is listed in the Pi Pocket gallery, install it from **Menu → Extensions → Discover** instead.

### Update

1. Copy the changed files over the installed ones.
2. If only `blackhole.ts` changed, Pocket reloads the module. No restart is needed.
3. If a file in `blackhole/` changed, restart Pi Pocket from the owner's menu before you rely on that change.

Before 0.2.0, the helpers were `_blackhole-worker.js` and `_blackhole-compiler.js` at the top of `extensions/`. After you install 0.2.0, delete those two files.

### Uninstall

Turn off `blackhole.ts` in **Menu → Extensions**, then delete the four files. Stored summaries remain. Ordinary sessions use Pocket's native model summarizer again.

## How compaction works

The module installs one `CompactionTask.beforeCompact` hook and one tool, `blackhole_recall`. Pocket still selects the replaced prefix and the verbatim tail. Pocket still stores the summary, manages tasks, and handles resets, forks, and restarts.

The hook checks `host.pip.ownerOf` before it reads the source. For PiP, it returns no decision, so PiP keeps its special summarizer. When the ownership API is missing, the hook declines visibly instead of guessing.

On the first compaction, the compiler receives the selected messages. On later compactions, the module identifies the previous `CompactionEntry`, unwraps its summary, and appends only a freshly compiled segment. It never recompiles older summaries.

The module uses `compileSegment`, not upstream `compile`. The `compile` merge path can discard native prose and cap older sections.

Each summary ends with one recall note. On append, the module removes the note only when it is the exact trailing text, then adds it after the new segment. This is the only change to earlier summary text.

### Not reproduced from the pi-blackhole CLI

The module does not implement Blackhole's segment ledger, coverage metadata, rebasing, or budget recovery. These CLI options have no effect, because Pocket's policy applies:

- `compactAfterTokens`: Pocket keeps its native trigger threshold.
- `midRunCompaction`: Pocket keeps its native mid-run behavior.
- `tailBehavior`: Pocket keeps its own cut and tool-result ordering.

Pocket exposes compaction policy as a harness-wide setting. A summary hook cannot safely change per-session timing. The module changes no Pocket settings or core files.

Pocket's own lessons and memory tool are unaffected. This module simply has no Blackhole observational memory.

## Recall

Brief-transcript lines end with refs such as `(#4182)`. Each number is the Pocket `EntryId` of the original message, not a positional index. Entry ids stay the same across restarts and forks, so no ledger is needed.

The hook maps each summarized message to its entry by object identity. Pi Durable builds `messages` from the same frozen objects as each entry's `model`. These messages get no ref:

- a message that a context edit replaced,
- a tool result that Pi Durable synthesized for a missing call,
- a message that two entries share,
- an earlier summary marker.

No ref is better than a wrong ref.

`blackhole_recall` takes these parameters:

- `ids`: up to 20 entry ids. The tool returns each entry's model text in full: user and assistant text, tool calls with arguments, and tool results. It never returns thinking. Images show as `[image]`.
- `offset`: a character offset, to page through an entry that is longer than the budget.
- `query`: words to find. Search is literal and case-insensitive, and every word must match. Regex syntax is plain text, so a pattern cannot hang the server. Search covers only entries older than the active head marker's `head`, newest first, 10 per page, and at most 10,000 entries.
- `page`: the results page of a query.

A response holds at most 24,000 characters. `ids` and `query` together share that budget. A truncated entry ends with the exact `offset` for the next call.

The tool reads through `tx.scanEntries` with the calling conversation's id. Pocket's storage returns only entries visible from that conversation: its own, and those a fork inherited up to its fork point. Another session's id returns "not found". Reads use small commits of 256 entries, so a search never holds the Session line for long. The tool is `replay: "safe"` and declares `readOnlyHint`, so plan mode allows it.

If you turn the module off, stored summaries keep their refs and note, but the tool is gone. A call then fails as an unknown tool. Context stays correct.

## Limits and failures

Deterministic extraction is lossy. Upstream rules clip text and cap the fresh brief transcript. The module does not interpret custom compaction instructions, and it says so when instructions are given.

Each compilation has these bounds:

- Source strings and object keys total at most 8 MiB characters, with a limit of 100,000 traversed values.
- Compilation runs in a separate worker with a five-second deadline and a 128 MiB old-generation heap limit.
- The cumulative summary holds at most 1 MiB characters.
- Pocket's token estimator must report fewer tokens for the wrapped summary than for the replaced non-system messages. System definitions are added back later and do not count as savings.

These are character and estimated-token checks, not exact provider token counts. Append growth eventually reaches a limit. The module then declines instead of silently deleting older segments.

Empty output, compiler errors, worker failures, malformed previous markers, excessive size, and non-shrinking summaries return `{ decline: true }`. A warning reaches the session, and context stays unchanged. There is no model fallback. An overflow can therefore stay unresolved until the owner resets, forks, or turns off the module.

Another extension that makes an earlier compaction decision can supersede this hook.

## Privacy and security

- No network calls, subprocesses, or file reads at run time. The worker loads only `blackhole/compiler.ts`.
- No prompt sections, durable documents, routes, or browser code.
- `blackhole_recall` reads only entries visible from the calling session.
- The worker gets an empty `execArgv`, so it does not inherit Node loaders or eval flags.

## Develop

You need a Pi Pocket checkout. The tests use its real `openApp` helpers, drop-in loader, and gallery checks.

1. Link Pi Pocket's dependencies:

   ```sh
   ln -s /path/to/pi-pocket/node_modules node_modules
   ```

2. Install the pinned build inputs into `build/node_modules/`:

   ```sh
   npm run setup:build
   ```

3. Rebuild, test, and check syntax:

   ```sh
   npm run build
   npm test
   npm run check
   ```

The tests find Pi Pocket through the `node_modules` link. To point them at another checkout, set `PI_POCKET_SOURCE`. Do not use `PI_POCKET_DIR`: Pi Pocket reads that variable as its data folder.

Tests run in an isolated data folder, auth folder, and settings, with a scripted faux provider. Temporary files stay under `.test-tmp/`. No request reaches a real model provider. `test-output.txt` records the last run.

### What the tests cover

- **Compaction:** compiler parity, worker launch under `--input-type=module -e`, native prose preservation, append-only growth, fresh-only recompilation, PiP exclusion, missing APIs, empty and failed output, size bounds, non-shrinking output, notices, and no model fallback.
- **Recall:** identity mapping and fail-closed refs, one trailing note across appends, full expansion, offset paging, hidden thinking, and literal paged search limited to compacted entries.
- **Real Pocket:** drop-in loading, retained-tail equality, restart, fork, reset, and PiP's unchanged summarizer. A real session gets compacted, and every ref must be one of its entry ids. The scripted model calls `blackhole_recall` by id and by query. A fork recalls inherited entries, and an unrelated session gets "not found".
- **Gallery:** Pi Pocket's own **Share…** check finds no problems, its index parser accepts the entry, and the module imports only its own files, Node, and Pocket packages.

### Build provenance

`blackhole/compiler.ts` is generated, not minified. `build.mjs` bundles only the `compileSegment` dependency graph from `pi-blackhole@0.5.11` with esbuild 0.28.2. `build/package.json` and `build/package-lock.json` pin every input.

The bundle resolves `@earendil-works/pi-tui` directly to `dist/utils.js`, which avoids unrelated terminal initialization. The output has 21 contributing source files and imports only `node:path`. `compiler-provenance.json` records each source file's SHA-256 and byte contribution. The test suite checks that no memory runtime, subprocess, worker, or network code is bundled.

The file ends in `.ts` because Pi Pocket's gallery treats `.js` files as browser code. Node strips types from the plain JavaScript without changing it.

## Publish to the Pi Pocket gallery

1. Push the commit with the files to `theskumar/pi-pocket-blackhole`.
2. Print the entry for that commit:

   ```sh
   npm run gallery-entry > blackhole.json
   ```

3. Open a pull request to [TannerMidd/pi-pocket-extensions](https://github.com/TannerMidd/pi-pocket-extensions) that adds `entries/blackhole.json`. Follow its CONTRIBUTING guide.

The script takes sizes and hashes from the commit, not the working tree. The test suite keeps its `declares` and description in sync with Pocket's Share draft.

## Repository layout

| Path | Purpose |
| --- | --- |
| `blackhole.ts` | The module: compaction hook and `blackhole_recall`. |
| `blackhole/` | Helpers that ship with the module: worker, compiler bundle, third-party licenses. |
| `blackhole.test.ts` | Unit and real-Pocket integration tests. |
| `build.mjs`, `build/` | Reproducible compiler build with pinned inputs. |
| `compiler-provenance.json` | Source hashes of the bundled compiler. |
| `scripts/gallery-entry.mjs` | Prints the gallery entry for a commit. |
| `CONTEXT.md` | Maintainer notes, one fact per line. |
| `docs/` | The original handoff and acceptance review. They predate recall. |

## License

MIT, see [LICENSE](LICENSE). The bundled compiler keeps the MIT licenses of pi-blackhole, `@earendil-works/pi-tui`, and `get-east-asian-width` in [blackhole/THIRD_PARTY_LICENSES.md](blackhole/THIRD_PARTY_LICENSES.md). pi-blackhole's compiler builds on [pi-vcc](https://github.com/sting8k/pi-vcc).
