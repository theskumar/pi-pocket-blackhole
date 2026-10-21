# Development

Build, test, and publish the module.

## Setup

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

## What the tests cover

- **Compaction:** compiler parity, worker launch under `--input-type=module -e`, native prose preservation, append growth, fresh-only recompilation, PiP exclusion, missing APIs, empty and failed output, size bounds, non-shrinking output, notices, and no model fallback.
- **Recall:** identity mapping and fail-closed refs, `#e` refs next to literal GitHub refs, one trailing note across appends and older wordings, full expansion, offset paging, the response budget with 20 truncated ids, hidden thinking, context edits and aborted turns, the reset boundary, keyed markers against forged roles, and literal search with stable `before` paging and scan bounds.
- **Real Pocket:** drop-in loading, retained-tail equality, restart, fork, reset, and PiP's unchanged summarizer. A real session gets compacted, and every ref, merged ones included, must be one of its entry ids. The scripted model calls `blackhole_recall` by id and by query. A fork recalls inherited entries but not the parent's later ones. An unrelated session gets "not found". After a reset, nothing before it comes back.
- **Practices:** plan mode runs recall, unknown arguments fail validation, cancel terminates a started worker and stops the walk, at most two workers run, and repeated automatic declines warn once.
- **Markers and status:** numbered markers continue across compactions, verify by hash, and cannot be forged by quoted text in a new segment. `/blackhole-status` runs through Pocket's real command runner after a compaction and after a reset. Unit tests cover the window share, an unknown window, a 1M window, 0.2.x and model-written summaries, 12 segments, edits, the last decline and its reset, internal errors kept out of the card, another session, and PiP.
- **Shrinking:** oldest transcripts first, header sections and older text kept, markers re-verified, pointers with the right range, overflow cuts every older transcript, someone else's markers untrusted, the window budget, one rate-limited notice, and `transcript omitted` in status. A file path that holds the separator cannot move the split. Recall `range` reads in order, pages within budget at any entry size, skips summaries and system prompts, stops at a reset, and names what its caps left unchecked. In real Pocket, the `range` argument passes Pocket's validator.
- **Hardening:** recall refuses PiP and a missing PiP check, queries have at most 16 words, image data counts toward the scan limit, and forged `</summary>` tags lose their shape.
- **Gallery:** Pi Pocket's own **Share…** check finds no problems, its index parser accepts the entry, and the module imports only its own files, Node, and Pocket packages.

## Build provenance

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

The gallery PR is on hold until Pocket offers a public PiP check: gallery rule G18 refuses internal APIs such as `host.pip`. See the roadmap.

The script takes sizes and hashes from the commit, not the working tree. The test suite keeps its `declares` and description in sync with Pocket's Share draft.
