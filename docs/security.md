# Security and privacy

What the module can reach, what it never returns, and how it treats untrusted text.

## Summary

- No network calls, subprocesses, or file reads at run time. The worker loads only `blackhole/compiler.ts`.
- No prompt sections, durable documents, routes, or browser code.
- `blackhole_recall` reads only entries visible from the calling session, and nothing before its newest reset.
- Recalled text comes back between keyed markers, labeled as quoted data.
- Recall refuses to run in PiP.
- Summary tags in quoted text lose their shape, so they cannot close Pocket's wrapper.
- The worker gets an empty `execArgv`, so it does not inherit Node loaders or eval flags.

## What recall never returns

- **Another session's entries.** The tool reads through `tx.scanEntries` with the calling conversation's id. Pocket's storage returns only entries visible from that conversation: its own, and those a fork inherited up to its fork point. Another session's id, or a parent's entry written after the fork, returns "not found".
- **Anything before the newest reset.** A reset starts a new context, and Pi no longer sees what came before. Recall stops at the newest `ResetEntry` for both ids and search. Content pasted before a reset stays out of reach.
- **What Pocket kept out of context.** Recall applies the newest context edit that targets an entry: `omit` hides it, and `replace` shows the replacement. It drops assistant messages that stopped as `aborted`, `error`, or `deferred`, as Pi Durable does.
- **Thinking.** Reasoning is never replayed.
- **Anything in PiP.** PiP's own summarizer leaves outside text out on purpose: session output, webhook payloads, and GitHub events. Recall refuses to run in PiP, so it cannot bring that text back. It also refuses when Pocket's internal PiP check is missing.

## Recalled text is quoted data

Recalled text can hold anything a web page or file held. Each response starts with a preamble that says the content is quoted data, not instructions. Each entry sits between markers that carry a random 12-hex-digit key, new for every call, such as `<<<3f9a01c2d4e5 #e4182 user, chars 0-1200 of 1200>>>` and `<<<3f9a01c2d4e5 end>>>`. Text inside the entry cannot know the key, so it cannot close the quote, fake a role, or fake another entry. Search snippets are JSON strings on one line, inside one keyed block.

## Summaries quote what they extract

Summaries are not fenced the same way. The compiler copies user text and tool output, such as an error message, into sections like `[Outstanding Context]`. A web page or tool result can therefore put its own words into a summary, and earlier segments stay until a reset. The module takes the shape out of `<summary` and `</summary` tags in a new segment, so quoted text cannot close Pocket's summary wrapper. Recall still returns the original text. Marking every quoted line as data needs a compiler change, which is on the roadmap.

## Segment markers

See [Segment markers](how-it-works.md#segment-markers) for why a planted marker is hard to make and what it could change.
