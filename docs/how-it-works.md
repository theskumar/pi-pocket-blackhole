# How it works

How the module builds, numbers, and trims summaries, what `/blackhole-status` shows, and when compaction declines. For recall, see [recall.md](recall.md). For the threat model, see [security.md](security.md).

## Compaction

The module installs one `CompactionTask.beforeCompact` hook, one tool, `blackhole_recall`, and one command, `/blackhole-status`. Pocket still selects the replaced prefix and the verbatim tail. Pocket still stores the summary, manages tasks, and handles resets, forks, and restarts.

The hook checks `host.pip.ownerOf` before it reads the source. For PiP, it returns no decision, so PiP keeps its special summarizer. `host.pip` is an internal Pocket API, not part of `types/pocket.d.ts`. When it is missing or renamed, the hook declines visibly instead of guessing.

On the first compaction, the compiler receives the selected messages. On later compactions, the module identifies the previous `CompactionEntry`, unwraps its summary, and appends only a freshly compiled segment. It never recompiles older summaries.

### Segment markers

Since 0.3.0, each new segment starts with one marker line:

```text
[Blackhole segment 3 · #e120..#e480 · 42 messages · h1a2b3c4d]
```

- **Number:** the count of verified segments in the previous summary, plus 1. Summaries from before 0.3.0 have none, so the first marked segment is 1. A count, not the highest number, so one odd marker cannot push the numbers out of range.
- **Range:** the lowest and highest entry id among the compiled messages, or `no refs` when none maps to an entry. Entry ids are global, so the range can hold other sessions' ids. It is a label, not a list.
- **Count:** the conversation messages compiled into the segment. System prompt markers do not count.
- **Hash:** the first 8 hex digits of the SHA-256 of the segment's text, up to the next marker line or the end.

Markers need no storage. A marker counts only when its hash matches its text. So a marker that the model summarizer copied into its own prose, with other text after it, does not count. Quoted text in a new segment cannot forge a marker either: its `[Blackhole segment ` becomes `[Blackhole_segment `. Text from before 0.3.0 never went through that step, and the hash is not a secret. A planted marker there could change the numbering and the status card, and, once a later summary is this module's again, let shrinking cut the text after it. Planting one is hard: the compiler flattens each message to one line, and the module replaces the separator in tool-call arguments (such as a file path) with `- - -` before compiling, so quoted text cannot hold the separator plus a marker line. Recall still returns the original arguments. The cut text stays recallable, and the pointer reaches only this session.

The module uses `compileSegment`, not upstream `compile`. The `compile` merge path can discard native prose and cap older sections.

Each summary ends with one recall note. On append, the module removes the note when it is the last paragraph: one line that starts with `Refs like (#` and names `` `blackhole_recall` ``. This also replaces a note in an older wording. The module then adds the note after the new segment. Besides this, only [trimming](#trimming) changes earlier summary text.

### Trimming

Since 0.4.0, a summary that gets too big sheds the brief transcripts of its oldest segments. Each segment is header sections (goals, files, commits, outstanding context, preferences), then `---`, then the brief transcript. Only the transcript is cut. It becomes one line:

```text
[Brief omitted: 42 messages. If needed, read them with blackhole_recall range [120, 480].]
```

A segment with no refs gets `If needed, search them with blackhole_recall query.` instead.

- **Budget:** an eighth of the session model's context window, as upstream pi-blackhole uses. A full context (`overflow`) gets half of that.
- **Hysteresis:** once the summary is over the budget, transcripts go, oldest first, until it is at 70% of the budget. The next few compactions then append without touching the top of the summary, so the provider's prompt cache keeps it.
- **The newest segment** is never cut for the budget. It is cut, last, only when a hard limit needs it: the summary must stay under 1 MiB and smaller than what it replaces. Before 0.4.0, those cases declined.
- **Window unknown:** the window comes from the hook's model registry. With none, only the hard limits apply, and a full context sheds every older transcript.
- **Never cut:** header sections, text before the first verified marker (the model summarizer's prose, Blackhole before 0.3.0), and segments whose marker label this module did not write. When the previous summary did not end with this module's note, only the new segment can shrink: markers in someone else's text are not trusted.
- **Markers:** a cut segment keeps its number, range, and count, and gets a new hash. `/blackhole-status` marks it `transcript omitted`.
- **Cost:** the summary is parsed and hashed once per compaction. A 1 MiB summary with 200 segments takes about 0.1 s.

Two notices, each at most once per session in 30 minutes:

- after a trim, `Blackhole trimmed older history in the summary (parts 1–12). Pi can still read it with blackhole_recall.`
- when the summary is still over twice the budget, a warning that it can't be trimmed further, with what to do: `/reset`, or turning the module off for one compaction so the model summarizer condenses it. A fork does not help: it inherits the summary.

### Not reproduced from the pi-blackhole CLI

The module does not implement Blackhole's segment ledger or rebasing. Segment markers carry a short form of coverage, and [trimming](#trimming) is a simpler form of budget recovery. These CLI options have no effect, because Pocket's policy applies:

- `compactAfterTokens`: Pocket keeps its native trigger threshold.
- `midRunCompaction`: Pocket keeps its native mid-run behavior.
- `tailBehavior`: Pocket keeps its own cut and tool-result ordering.

Pocket exposes compaction policy as a harness-wide setting. A summary hook cannot safely change per-session timing. The module changes no Pocket settings or core files.

Pocket's own lessons and memory tool are unaffected. This module simply has no Blackhole observational memory.

## Status

`/blackhole-status` posts a card in the session. Everyone who sees the session sees the card, viewers too, and it stays in the session, its search, and its export. Pi never gets it. Anyone who can steer the session can run it, guests invited to that session included. It shows:

- the newest summary's estimated tokens and characters,
- its share of the context window of the session's model,
- its share of the 1 MiB summary limit, once past half,
- the newest 10 segments, oldest first, each with its range, message count, and size, marked `transcript omitted` once shrunk, and the size of older text before the first one,
- the messages Pi has seen since that compaction, and their estimated tokens, up to 5,000 messages,
- the last decline, with its trigger (automatic, manual, or context full), until a success, a reset, or a newer compaction.

It finds the session's newest compaction or reset with one indexed read, then reads only the entries after it. Context edits apply, as for recall. In PiP it says that PiP keeps its own summarizer.

A decline in the card shows only the module's own reasons. Any other error can name the server's folders, so the card and the session's warning say "internal error". The details go to Pocket's log and to the server's members, never to people invited to one session only.

A command gets no model registry, so the hook notes each model's context window when it runs, before anything that can fail. Until then the card says the window is not known yet. The windows, by model, are shared by all sessions. The windows and the last decline live in memory only. A reload or restart forgets them, which is safe.

## Limits and failures

Deterministic extraction is lossy. Upstream rules clip text and cap the fresh brief transcript. The module does not interpret custom compaction instructions, and it says so when instructions are given.

Each compilation has these bounds:

- Source strings and object keys total at most 8 MiB characters, with a limit of 100,000 traversed values.
- Compilation runs in a separate worker with a five-second deadline and a 128 MiB old-generation heap limit. At most two workers run at once. Others wait their turn, and the deadline starts when the turn starts.
- The cumulative summary holds at most 1 MiB characters.
- Pocket's token estimator must report fewer tokens for the wrapped summary than for the replaced non-system messages. System definitions are added back later and do not count as savings.

These are character and estimated-token checks, not exact provider token counts. Before any of them declines, the module shrinks old transcripts (see [Trimming](#trimming)). It declines only when header sections and older text alone are too big.

Empty output, compiler errors, worker failures, malformed previous markers, excessive size, and non-shrinking summaries return `{ decline: true }`. A warning reaches the session, and context stays unchanged. A manual or overflow compaction always warns. An automatic compaction that declines for the same reason warns once per session, then again after 30 minutes, after a success, or when the reason changes. A cancelled turn stops the worker at once and declines without a warning. Notices reach only tabs open at that moment. An automatic decline with nobody watching uses up its warning, so the next automatic decline in 30 minutes stays quiet. A manual compaction always shows the reason. There is no model fallback. An overflow can therefore stay unresolved until the owner resets, forks, or turns off the module.

Another extension that makes an earlier compaction decision can supersede this hook.
