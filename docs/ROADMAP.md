# Roadmap

Planned work for the Blackhole drop-in, in the order we plan to do it. Every item stays deterministic: no model calls.

This list comes from three reviews in October 2026: a comparison with upstream pi-blackhole 0.5.13, a review of the Pi Pocket author's own extensions, and the 0.2.1 security, correctness, and maintainability reviews. When an item ships, move it to `CHANGELOG.md` and delete it here.

Effort: **S** is under a day, **M** is a few days, **L** is a week or more.

## Next: 0.4.x, better summaries and recall

### Recall `ids` parity (S)

`ids` still returns system-role parts, which `range` and search skip. Recall can also return a tool result that Pi Durable's `orderToolResults` drops for lack of a matching call. Filter both, as Pi sees them.

### Tune the shrink threshold (S)

0.4.0 trims above an eighth of the window (half on overflow), down to 70%. Check real sessions with `/blackhole-status` and adjust. Header sections still grow without a cap; the next item addresses that.

### Merge old segments' header sections (M)

When several old segments are kept, merge their goals, files, commits, and preferences into one block: remove duplicates and cap counts, as upstream does (goals 8, preferences 15, commits 8, files 20/20/10).

- **Needs:** a compiler rebuild that also exports `mergeFileLines`, `extractSection`, and `capBrief`.
- **Rule:** merge Blackhole segments only. Upstream `compile` drops prose without section headers, so never feed it native summaries.
- **Risk:** goals keep the first 8 and can go stale. Outstanding context from old segments is dropped, and recall must cover it.

### Ranked search when the literal search finds nothing (S, M for BM25)

Today every word must match. When nothing matches, rank entries by how many distinct words they contain, with rare words weighted higher. Keep the current scan bounds and the reset stop.

- **Upstream:** BM25, a weak-match cut, at most 50 results (`search-entries.ts`).
- **Never:** regex terms. A bad pattern can hang the shared server thread.

### Read file content by lines (S-M)

Add a `path` argument that returns the content of write and edit calls for one file, paged by lines.

- **Why:** tool calls come back as JSON today, so file content arrives full of `\n` escapes and pages by characters.
- **Upstream:** `#N:path[:offset:limit]` in `drill-down.ts`.
- **Risk:** tool argument shapes vary. Fall back to the raw call.

### Files touched, by path (M, low priority)

A recall mode that lists files with the entries that touched them. `collectFilesTouched` is already in the bundle but not exported. Each segment's `[Files And Changes]` section covers most of this today.

### Mark quoted text in summaries (M)

Summaries copy user text and tool output into sections such as `[Outstanding Context]`. 0.2.2 takes the shape out of `<summary>` tags, but a quoted line still reads like the summary's own words.

- **Change:** tag lines that come from tool output, for example `[from tool output]`, or fence them. This needs a compiler patch at build time, recorded in `compiler-provenance.json`.
- **Why:** an injected error message or web page then reads as quoted data across every later compaction, as recall output already does.

## Engineering

### Type checking (M)

- Import `Host` from Pocket's `_pocket.d.ts` with `import type`, and add `pip` on top. Link the file and gitignore it, as `pocket-mcp` does, instead of committing a copy that goes out of date.
- Install pinned `typescript` and `@types/node` into a tools folder, like `build/`.
- Add `tsc --noEmit` to `npm run check`, with Pocket's strict tsconfig.
- Allow that one type import in the gallery-rules test.
- Check the module's inline copies of Pocket types (`Host`, `Web`, `StatusContext`, `ModelRef`) with `satisfies` against `types/pocket.d.ts` in a test-only file.
- First check that Pocket's Share check accepts the linked `_pocket.d.ts`, and update the import rule in `CONTEXT.md`, which forbids type imports from a Pocket checkout.

### CI on GitHub (M)

- Run the tests on the `minPocket` tag (v0.16.0) and the newest Pocket tag.
- Rebuild the compiler and fail on any diff in `blackhole/compiler.ts` or `compiler-provenance.json`. Reviewers then see that the bundle is reproducible.
- Copy the gallery workflow's hygiene: actions pinned to full commit ids, `permissions: contents: read`, `persist-credentials: false`.

### Formatting (S)

Prettier with `tabWidth 4` and `printWidth 100`, as the author uses. Exclude `blackhole/compiler.ts` so the bundle stays byte-identical.

## On hold

- **Gallery PR** to `TannerMidd/pi-pocket-extensions`, by the owner's choice. When it resumes: run `npm run gallery-entry`, follow the gallery's CONTRIBUTING guide, and check that its CI Pocket version is at least `minPocket`.
- **Blocker for the gallery: `host.pip` is internal.** Gallery rule G18 refuses modules that use internal interfaces, and naming the risk in the description does not lift it. Before the PR, ask Pi Pocket for an extension point, as G18 says: a public PiP check, or a way to scope `beforeCompact` to ordinary sessions. Then drop `host.pip`.

## Not planned

Each of these was considered and turned down.

- **Observational memory** (observer, reflector, `/blackhole-memory`): it calls models. Pocket's own Memory covers lessons across sessions.
- **Project-wide recall, `/blackhole-export`, recall `scope:all`:** they read other sessions. In Pocket, sessions in one folder can belong to different people.
- **Regex search:** risk of hanging the server.
- **Upstream `compile` rewrite mode:** it drops native prose.
- **Own cut, `tailBehavior`, `compactAfterTokens`, `midRunCompaction`:** Pocket owns these settings. The hook cannot move the cut.
- **Shrinking old tool output in the kept tail:** `beforeRequest` cannot save its choices, so the provider's prompt cache would miss on every turn.
- **git status tags on file lines:** they need subprocesses, which the module forbids.
- **Model fallback on an empty summary:** the module never calls models.
- **A settings page, routes, or browser parts:** nothing to configure yet, and each adds code to review.
- **Splitting recall into `blackhole/recall.ts`:** a change to a helper file needs a Pocket restart. Code in `blackhole.ts` reloads without one.
