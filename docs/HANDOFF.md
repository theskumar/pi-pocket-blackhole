# Pocket Blackhole adapter

User requested a Pi Pocket integration of pi-blackhole's deterministic compaction only. No observational memory or model workers. Existing CLI config: compaction auto, memory false, compactionSummaryMode append, compactAfterTokens 140000, midRunCompaction off, tailBehavior pi-default.

Build in this standalone folder. Do not edit the live Pocket repository at /Users/theskumar/code/pi-pocket or live data. Pocket drop-in will remain disabled until owner enables it. No commits, pushes, deployments, or server restart. Use isolated test data. PiP must retain its special summarizer unchanged.

References: Pocket docs/index.md, extensions.md, self-editing.md, map.md, architecture.md. Installed Blackhole: /Users/theskumar/.pi/agent/npm/node_modules/pi-blackhole (0.5.11, MIT). Pi Durable beforeCompact hook can provide a deterministic summary. Need bundle only compiler dependency graph, never package entry or memory runtime. Preserve upstream license. No hallucinated recall tool references.

This handoff records scope outside cowork-kb; no wiki writes authorized.

Superseded (0.2.0 and later): the owner asked for a recall tool. Refs are real Pocket entry ids, and `blackhole_recall` resolves them, so they are not hallucinated. The module is public at theskumar/pi-pocket-blackhole. See README.md and docs/REVIEW.md.
