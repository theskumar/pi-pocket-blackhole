# Blackhole compaction for Pi Pocket

A [Pi Pocket](https://github.com/TannerMidd/pi-pocket) drop-in that replaces ordinary sessions' compaction summaries with deterministic [pi-blackhole](https://github.com/k0valik/pi-blackhole) extraction. It makes no model calls. Summary lines carry refs to the original messages, and a read-only tool, `blackhole_recall`, reads those messages back.

- **Deterministic.** The same history and context window always give the same summary. Compaction costs no tokens and cannot fail on a provider error.
- **Trimmed, not truncated.** Each compaction adds a numbered segment. Past an eighth of the context window, the oldest segments' transcripts become pointers that recall can follow. Header sections and model-written text stay as written.
- **Visible.** `/blackhole-status` shows a session's summary size, its share of the context window, its segments, and its last decline.
- **Recallable.** Refs such as `(#e4182)` are Pocket entry ids. `blackhole_recall` expands them, reads a span of history in order, or searches it.
- **Contained.** No network access, no files outside the module, no reads from other sessions, and nothing from before a reset. PiP keeps its own summarizer, and recall refuses to run there.

It runs the real `pi-blackhole@0.5.11` `compileSegment` compiler in a bounded worker. It does not load Blackhole's observational memory, model workers, or CLI tools.

## Requirements

- Pi Pocket 0.16.0 or later (extension API 1).
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
3. In Pi Pocket, open **Menu → Extensions**, and turn on `blackhole.ts`. Drop-ins start off.

A fresh installation needs no restart. Once the module is in the Pi Pocket gallery, install it from **Menu → Extensions → Discover** instead.

### Update

- If only `blackhole.ts` changed, copy it. Pocket reloads the module without a restart.
- If a file in `blackhole/` changed, copy the folder first, then `blackhole.ts`. Restart Pi Pocket from the owner's menu.

From 0.1.x, also delete the old `_blackhole-worker.js` and `_blackhole-compiler.js`, then restart. `CHANGELOG.md` lists what each version needs.

### Uninstall

Turn off `blackhole.ts` in **Menu → Extensions**, then delete the four files. Stored summaries remain. Ordinary sessions use Pocket's native model summarizer again.

## Use

Compaction runs as before, automatically or with `/compact`. Blackhole writes the summary instead of a model.

**See the summary.** Type `/blackhole-status` in a session. Everyone in the session sees the card, and Pi does not.

```text
Blackhole status
Summary: about 12k tokens (41,200 characters).
Summary is 6% of the 200k window (claude-opus-5-5).
Segments: 3, oldest first:
- 1 · #e120..#e480 · 42 messages · 8,100 characters · transcript omitted
- …
Since then: 37 messages, about 9.1k tokens.
```

**Recall.** Pi calls `blackhole_recall` on its own when it needs a detail. You can also ask for it:

- by id: "recall #e4182",
- by span, as a `[Brief omitted …]` line names it: "recall range 120 to 480",
- by words: "search history for ZEBRA-4412".

**When compaction declines,** a warning says why, and context stays unchanged. There is no model fallback. To free space, use `/reset`, or turn off `blackhole.ts` for one compaction.

## Limits

- Extraction is lossy. Custom compaction instructions are not interpreted.
- Header sections (goals, files, commits) are never trimmed, so a very long session can still need a `/reset`.
- The module uses Pocket's internal `host.pip` API to skip PiP. If Pocket removes it, compaction declines and recall refuses.
- Another extension that makes an earlier compaction decision can supersede this hook.

## Documentation

| Doc | What it covers |
| --- | --- |
| [How it works](docs/how-it-works.md) | Compaction, segment markers, trimming, the status card, bounds, and declines. |
| [Recall](docs/recall.md) | How refs map to messages, the tool's parameters, and its bounds. |
| [Security and privacy](docs/security.md) | What the module can reach, what recall never returns, and untrusted text. |
| [Development](docs/development.md) | Setup, tests, the reproducible compiler build, and gallery publishing. |
| [Roadmap](docs/ROADMAP.md) | Planned work, in order, with reasons. |
| [Changelog](CHANGELOG.md) | What changed in each version, and how to update. |

## Repository layout

| Path | Purpose |
| --- | --- |
| `blackhole.ts` | The module: compaction hook, `blackhole_recall`, and `/blackhole-status`. |
| `blackhole/` | Helpers that ship with the module: worker, compiler bundle, third-party licenses. |
| `blackhole.test.ts` | Unit and real-Pocket integration tests. |
| `build.mjs`, `build/`, `compiler-provenance.json` | Reproducible compiler build with pinned inputs and source hashes. |
| `scripts/gallery-entry.mjs` | Prints the gallery entry for a commit. |
| `CONTEXT.md` | Maintainer notes, one fact per line. |
| `docs/` | The docs above, and `REVIEW.md`, the acceptance and recall reviews. |

## License

MIT, see [LICENSE](LICENSE). The bundled compiler keeps the MIT licenses of pi-blackhole, `@earendil-works/pi-tui`, and `get-east-asian-width` in [blackhole/THIRD_PARTY_LICENSES.md](blackhole/THIRD_PARTY_LICENSES.md). pi-blackhole's compiler builds on [pi-vcc](https://github.com/sting8k/pi-vcc).
