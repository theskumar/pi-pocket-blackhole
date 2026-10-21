# Recall

How summary refs map to messages, and how `blackhole_recall` reads them back. For what recall never returns and why, see [security.md](security.md).

## Refs

Brief-transcript lines end with refs such as `(#e4182)`. Repeated tool calls merge into `(#e5, #e7) x2`. Each number is the Pocket `EntryId` of the original message, not a positional index. Entry ids stay the same across restarts and forks, so no ledger is needed.

The `e` keeps refs apart from text such as a GitHub `(#123)` in a commit subject. The compiler parses its own refs as digits, so the hook passes it entry ids plus a 16-digit offset. After compilation, only the offset numbers of the passed ids become `#e<id>`. Any other number stays as written.

The hook maps each summarized message to its entry by object identity. Pi Durable builds `messages` from the same frozen objects as each entry's `model`. These messages get no ref:

- a message that a context edit replaced,
- a tool result that Pi Durable synthesized for a missing call,
- a message that two entries share,
- an earlier summary marker.

No ref is better than a wrong ref.

## Parameters

`blackhole_recall` takes these parameters:

- `ids`: up to 20 entry ids, the number after `#e`. The tool returns each entry as the model saw it: user and assistant text, tool calls with arguments, and tool results. Images show as `[image]`.
- `offset`: a character offset into each entry, to page through one that is longer than its share of the budget.
- `query`: words to find. Search is literal and case-insensitive, and every word must match. Each word is escaped before matching, so regex syntax is plain text and a pattern cannot hang the server. Search covers only entries older than the active head marker's `head`, newest first, 10 per call. It skips summary markers, system prompts, and role labels.
- `before`: continue a query with entries older than this id. Each result names the exact value for the next call, so pages do not shift when a new compaction happens between calls.
- `range`: `[from, to]`, as a "Brief omitted" line names it. Returns this session's entries with ids in that span, oldest first, each cut at 3,000 characters with a hint to read the rest by id. Use it on its own, without `ids`, `query`, `offset`, or `before`. Entry ids are global, but only this session's visible entries come back. A long range pages: the response names the next `range`. A range checks at most 10,000 entries or 32 MiB of text; past that, it names the part it did not check. A range older than the newest 50,000 entries says it was not checked.

## Bounds

- A response holds at most 24,000 characters. `ids` and `query` share that budget. A truncated entry ends with the exact `offset` for the next call.
- One entry yields at most 1 MiB of text.
- A query has at most 16 words. Each word is one more pass over each entry's text.
- Search checks at most 10,000 entries, or 32 MiB of text, per call. Inline image data counts toward the 32 MiB, though it shows as `[image]`. Search then names the `before` value to continue.
- A walk starts at the newest entry, so that it sees every edit in force, and visits at most 50,000 entries. Reads use small commits of 64 entries, so one call never holds the Session line for long.

The tool is `replay: "safe"` and declares `readOnlyHint`, so plan mode allows it. New calls with unknown arguments, such as the `page` of 0.2.0, fail validation. A 0.2.0 call interrupted before an upgrade replays with its saved arguments, which ignores `page`. A cancelled turn stops a walk before its next read. Pocket offers drop-in tools in every session, so PiP sees the tool too, and the tool refuses there.

If you turn the module off, stored summaries keep their refs and note, but the tool is gone. The note says to call the tool only if it is available. A call fails with Pocket's "not available" error, and context stays correct.
