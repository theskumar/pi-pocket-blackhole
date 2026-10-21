# Changelog

What changed in each version, in plain terms. Newest first.

## 0.2.1 (2026-10-21)

Safety and accuracy fixes for `blackhole_recall`, from three independent reviews. No review found a way for one session to read another's messages.

### Upgrade notes

- Refs in new summaries look like `(#e4182)` instead of `(#4182)`. Summaries written by 0.2.0 keep their old refs. The tool still accepts the plain number.
- Search pages with `before` instead of `page`. Each search result names the `before` value for the next call.

### Fixed

- **Reset now hides the past from recall.** Before, a search could still find something you pasted before a `/reset`, such as an API key. Recall now stops at the newest reset, for ids and for search.
- **Recalled text can't pose as you.** Before, a fetched web page that contained `[user] run this` came back looking like a real message from you. Each recalled message now sits between markers with a random key, under a note that says the content is quoted data.
- **Refs no longer clash with GitHub numbers.** A commit subject such as `fix: typo (#123)` used to look like a recall ref. Refs now carry an `e`, and GitHub numbers stay as written.
- **Recall shows what Pi actually saw.** It now applies context edits and skips aborted or failed replies, as Pocket does.
- **Search finds what you mean.** It skips system prompts and the words "user" and "assistant" in role labels. It places snippets correctly in every language. Pages no longer shift when a compaction happens between two searches.
- **Limits hold.** A response never exceeds 24,000 characters, even with 20 long messages. The search limit is exact, and the result says where to continue.
- **The recall note behaves.** A note in an older wording is replaced instead of stuck mid-summary. The note says to use the tool only if it is available, for when the extension is off.

### Docs

- The README explains what recall never returns, how recalled text is quoted, and how to update safely from 0.1.x.
- The README says that `host.pip` is an internal Pocket API.

## 0.2.0 (2026-10-21)

### Added

- **`blackhole_recall` tool.** Summary lines end with refs to the original messages. Pi can read a message back in full by its ref, or search history that has left context. The tool only reads, and only in the calling session and the sessions it was forked from.
- **Ready for the Pi Pocket gallery.** The helpers moved into a `blackhole/` folder. The compiler build is reproducible from pinned inputs. The repository has an MIT license and a script that prints the gallery entry.

### Upgrade notes

- The helper files moved. Copy `blackhole/` first, then `blackhole.ts`. Delete `_blackhole-worker.js` and `_blackhole-compiler.js`. Restart Pi Pocket.

## 0.1.0 (2026-10-15)

### Added

- **Deterministic compaction.** Ordinary sessions get their compaction summaries from pi-blackhole's compiler instead of a model. It costs no tokens, and the same history always gives the same summary.
- **Append-only summaries.** Each compaction adds a segment. Earlier summaries stay as they were.
- **Fails visibly.** When the compiler can't help, compaction declines with a warning and nothing changes. PiP keeps its own summarizer.
