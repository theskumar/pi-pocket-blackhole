# Changelog

What changed in each version, in plain terms. Newest first.

## 0.4.0 (2026-10-21)

Long sessions keep working: the summary now trims old history instead of growing until compaction fails.

### Added

- **Old transcripts get trimmed.** When the summary passes an eighth of the model's context window, the message-by-message transcript of its oldest parts becomes one line: `[Brief omitted: 42 messages. If needed, read them with blackhole_recall range [120, 480].]`. Goals, files, commits and the other headers stay, and so does the newest part. It trims down to 70% of the budget, so the next few compactions leave the top of the summary alone and the prompt cache keeps working.
- **Recall by range.** `blackhole_recall` takes `range: [from, to]` and returns that part of the session in order, a page at a time. Pi follows the "Brief omitted" line with it.
- **Notices.** One short note says when older history was trimmed. If the summary is still over twice the budget, a warning suggests `/reset`, or turning Blackhole off for one compaction. Each shows at most once per session in 30 minutes.

### Changed

- **Fewer declines.** A summary over 1 MiB, or one that wouldn't save tokens, now trims old transcripts first, and the newest part last. It declines only if that isn't enough.
- **Earlier summaries can change.** Before, older parts stayed byte-for-byte forever. Now a Blackhole part can lose its transcript. Text the model summarizer wrote, and anything from before 0.3.0, still never changes.
- `/blackhole-status` marks trimmed parts `transcript omitted`.
- The recall note at the end of each summary now mentions `range`.

### Updating

Copy `blackhole.ts`. The files in `blackhole/` did not change, so no restart is needed.

## 0.3.0 (2026-10-21)

See how big a session's summary is getting, before it becomes a problem.

### Added

- **`/blackhole-status`.** Type it in a session to see the summary's size, its share of the model's context window, its segments, and the last time compaction declined. It posts a card for everyone in the session, and the card stays in the session and its export. Pi never sees it.
- **Numbered segments.** Each compaction's part of the summary now starts with a line such as `[Blackhole segment 3 · #e120..#e480 · 42 messages · h1a2b3c4d]`. It tells you which messages that part covers. The short hash at the end lets Blackhole check that the line belongs to the text after it. Later versions will use these lines to shrink old parts.

### Changed

- **Unexpected errors stay private.** When compaction fails for a reason Blackhole didn't expect, the session's warning says "internal error". The details, which can name folders on the server, go to Pocket's log and the server's members instead.

### Good to know

- Summaries written before 0.3.0 have no segment lines. Status counts them as older text, and the first new segment is number 1.
- The context window shows as "not known yet" until Blackhole has run a compaction with that model since Pi Pocket started or the module reloaded.

### Updating

Copy `blackhole.ts`. The files in `blackhole/` did not change, so no restart is needed.

## 0.2.2 (2026-10-21)

Fixes for cancelling, warnings, and compatibility.

### Changed

- **Works with Pi Pocket 0.16.0 and later.** It asked for 0.18.0 before, but nothing it uses is newer than 0.16.0. The tests pass on both.
- **Cancelling stops the compiler at once.** It used to run for up to 5 seconds after a cancel. A recall search stops before its next read. A cancel no longer shows a "declined" warning.
- **One warning, not one per turn.** When automatic compaction keeps declining for the same reason, you see the warning once. It shows again after 30 minutes, or when the reason changes. A compaction you start, or one forced by a full context, always says why it declined.
- **Recall stays out of PiP.** PiP's own summaries leave out text from webhooks, GitHub events, and other sessions on purpose. Recall used to be able to search that text back. It now refuses to run in PiP.
- **Summaries can't be broken out of.** An error message or web page that contains `</summary>` used to end Pocket's summary wrapper early, so the rest of the text looked like it came from outside the summary. Those tags now lose their shape.
- **Lighter on the server.** At most two compilers run at once. A search takes at most 16 words, and large inline images count toward its scan limit.
- **Clearer warnings.** A declined compaction now says what to do: start a new context with `/reset`, fork, or turn the module off to use the model summarizer.
- **Wrong tool arguments fail loudly.** A model that still sends the old `page` argument gets an error instead of page 1 again.
- **Declares its extension API.** The module now says it is written for Pi Pocket extension API 1.
- **The gallery description names the risks.** It now says that there is no model fallback, that it uses an internal Pocket API to skip PiP, and that the recall tool is offered in every session.

### Docs

- New `docs/ROADMAP.md` with the planned work and why.

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
