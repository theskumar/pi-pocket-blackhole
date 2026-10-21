# Blackhole compaction for Pi Pocket

A [Pi Pocket](https://github.com/TannerMidd/pi-pocket) drop-in that replaces ordinary sessions' compaction summaries with deterministic [pi-blackhole](https://github.com/k0valik/pi-blackhole) extraction. It makes no model calls. Summary lines carry refs to the original messages, and a read-only tool, `blackhole_recall`, reads those messages back.

- **Deterministic.** The same history always gives the same summary. Compaction costs no tokens and cannot fail on a provider error.
- **Append-only.** Each compaction adds a new segment. Earlier summaries, native or deterministic, stay byte-for-byte.
- **Recallable.** Refs such as `(#e4182)` are Pocket entry ids. `blackhole_recall` expands them in full or searches compacted history.
- **Contained.** No network access, no files outside the module, no reads from other sessions, and nothing from before a reset. PiP keeps its own summarizer.

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

Before 0.2.0, the helpers were `_blackhole-worker.js` and `_blackhole-compiler.js` at the top of `extensions/`. To update from 0.1.x:

1. Copy the `blackhole/` folder first.
2. Copy `blackhole.ts`. Copying it alone leaves the module without its worker, and every compaction declines.
3. Delete `_blackhole-worker.js` and `_blackhole-compiler.js`.
4. Restart Pi Pocket from the owner's menu.

### Uninstall

Turn off `blackhole.ts` in **Menu → Extensions**, then delete the four files. Stored summaries remain. Ordinary sessions use Pocket's native model summarizer again.

## How compaction works

The module installs one `CompactionTask.beforeCompact` hook and one tool, `blackhole_recall`. Pocket still selects the replaced prefix and the verbatim tail. Pocket still stores the summary, manages tasks, and handles resets, forks, and restarts.

The hook checks `host.pip.ownerOf` before it reads the source. For PiP, it returns no decision, so PiP keeps its special summarizer. `host.pip` is an internal Pocket API, not part of `types/pocket.d.ts`. When it is missing or renamed, the hook declines visibly instead of guessing.

On the first compaction, the compiler receives the selected messages. On later compactions, the module identifies the previous `CompactionEntry`, unwraps its summary, and appends only a freshly compiled segment. It never recompiles older summaries.

The module uses `compileSegment`, not upstream `compile`. The `compile` merge path can discard native prose and cap older sections.

Each summary ends with one recall note. On append, the module removes the note when it is the last paragraph: one line that starts with `Refs like (#` and names `` `blackhole_recall` ``. This also replaces a note in an older wording. The module then adds the note after the new segment. This is the only change to earlier summary text.

### Not reproduced from the pi-blackhole CLI

The module does not implement Blackhole's segment ledger, coverage metadata, rebasing, or budget recovery. These CLI options have no effect, because Pocket's policy applies:

- `compactAfterTokens`: Pocket keeps its native trigger threshold.
- `midRunCompaction`: Pocket keeps its native mid-run behavior.
- `tailBehavior`: Pocket keeps its own cut and tool-result ordering.

Pocket exposes compaction policy as a harness-wide setting. A summary hook cannot safely change per-session timing. The module changes no Pocket settings or core files.

Pocket's own lessons and memory tool are unaffected. This module simply has no Blackhole observational memory.

## Recall

Brief-transcript lines end with refs such as `(#e4182)`. Repeated tool calls merge into `(#e5, #e7) x2`. Each number is the Pocket `EntryId` of the original message, not a positional index. Entry ids stay the same across restarts and forks, so no ledger is needed.

The `e` keeps refs apart from text such as a GitHub `(#123)` in a commit subject. The compiler parses its own refs as digits, so the hook passes it entry ids plus a 16-digit offset. After compilation, only the offset numbers of the passed ids become `#e<id>`. Any other number stays as written.

The hook maps each summarized message to its entry by object identity. Pi Durable builds `messages` from the same frozen objects as each entry's `model`. These messages get no ref:

- a message that a context edit replaced,
- a tool result that Pi Durable synthesized for a missing call,
- a message that two entries share,
- an earlier summary marker.

No ref is better than a wrong ref.

`blackhole_recall` takes these parameters:

- `ids`: up to 20 entry ids, the number after `#e`. The tool returns each entry as the model saw it: user and assistant text, tool calls with arguments, and tool results. Images show as `[image]`.
- `offset`: a character offset into each entry, to page through one that is longer than its share of the budget.
- `query`: words to find. Search is literal and case-insensitive, and every word must match. Each word is escaped before matching, so regex syntax is plain text and a pattern cannot hang the server. Search covers only entries older than the active head marker's `head`, newest first, 10 per call. It skips summary markers, system prompts, and role labels.
- `before`: continue a query with entries older than this id. Each result names the exact value for the next call, so pages do not shift when a new compaction happens between calls.

### What recall never returns

- **Another session's entries.** The tool reads through `tx.scanEntries` with the calling conversation's id. Pocket's storage returns only entries visible from that conversation: its own, and those a fork inherited up to its fork point. Another session's id, or a parent's entry written after the fork, returns "not found".
- **Anything before the newest reset.** A reset starts a new context, and Pi no longer sees what came before. Recall stops at the newest `ResetEntry` for both ids and search. Content pasted before a reset stays out of reach.
- **What Pocket kept out of context.** Recall applies the newest context edit that targets an entry: `omit` hides it, and `replace` shows the replacement. It drops assistant messages that stopped as `aborted`, `error`, or `deferred`, as Pi Durable does.
- **Thinking.** Reasoning is never replayed.

### Recalled text is quoted data

Recalled text can hold anything a web page or file held. Each response starts with a preamble that says the content is quoted data, not instructions. Each entry sits between markers that carry a random 12-hex-digit key, new for every call, such as `<<<3f9a01c2d4e5 #e4182 user, chars 0-1200 of 1200>>>` and `<<<3f9a01c2d4e5 end>>>`. Text inside the entry cannot know the key, so it cannot close the quote, fake a role, or fake another entry. Search snippets are JSON strings on one line, inside one keyed block.

### Bounds

- A response holds at most 24,000 characters. `ids` and `query` share that budget. A truncated entry ends with the exact `offset` for the next call.
- One entry yields at most 1 MiB of text.
- Search checks at most 10,000 entries, or 32 MiB of text, per call. It then names the `before` value to continue.
- A walk starts at the newest entry, so that it sees every edit in force, and visits at most 50,000 entries. Reads use small commits of 64 entries, so one call never holds the Session line for long.

The tool is `replay: "safe"` and declares `readOnlyHint`, so plan mode allows it. It is offered in every session, PiP included, because Pocket's drop-in tools are global.

If you turn the module off, stored summaries keep their refs and note, but the tool is gone. The note says to call the tool only if it is available. A call fails with Pocket's "not available" error, and context stays correct.

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
- `blackhole_recall` reads only entries visible from the calling session, and nothing before its newest reset.
- Recalled text comes back between keyed markers, labeled as quoted data.
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
- **Recall:** identity mapping and fail-closed refs, `#e` refs next to literal GitHub refs, one trailing note across appends and older wordings, full expansion, offset paging, the response budget with 20 truncated ids, hidden thinking, context edits and aborted turns, the reset boundary, keyed markers against forged roles, and literal search with stable `before` paging and scan bounds.
- **Real Pocket:** drop-in loading, retained-tail equality, restart, fork, reset, and PiP's unchanged summarizer. A real session gets compacted, and every ref, merged ones included, must be one of its entry ids. The scripted model calls `blackhole_recall` by id and by query. A fork recalls inherited entries but not the parent's later ones. An unrelated session gets "not found". After a reset, nothing before it comes back.
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
| `CHANGELOG.md` | What changed in each version. |
| `CONTEXT.md` | Maintainer notes, one fact per line. |
| `docs/` | The original handoff and acceptance review. `docs/REVIEW.md` ends with the recall review. |

## License

MIT, see [LICENSE](LICENSE). The bundled compiler keeps the MIT licenses of pi-blackhole, `@earendil-works/pi-tui`, and `get-east-asian-width` in [blackhole/THIRD_PARTY_LICENSES.md](blackhole/THIRD_PARTY_LICENSES.md). pi-blackhole's compiler builds on [pi-vcc](https://github.com/sting8k/pi-vcc).
