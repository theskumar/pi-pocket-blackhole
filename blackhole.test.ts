import assert from 'node:assert/strict';
import { mkdirSync, copyFileSync, readFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
mkdirSync(join(here, '.test-tmp'), { recursive: true });
process.env.TMPDIR = join(here, '.test-tmp');
// Helpers isolate auth, settings, data, home, and providers before importing Pocket.
const H = await import('/Users/theskumar/code/pi-pocket/test/helpers.ts');
const { CompactionEntry } = await import('@earendil-works/pi-durable');
const { fauxAssistantMessage, fauxText, fauxToolCall } = await import('@earendil-works/pi-ai/providers/faux');
const { createBeforeCompact, MAX_SOURCE_CHARS, MAX_SUMMARY_CHARS, MAX_RECALL_CHARS, RECALL_NOTE, recallTool, sourceIds } = await import('./blackhole.ts');
const { compileSegment } = await import('./_blackhole-compiler.js');
const PREFIX = 'The conversation history before this point was compacted into the following summary:\n\n<summary>\n';
const SUFFIX = '\n</summary>';
const SEP = '\n\n---\n\n';
const NOTE = SEP + RECALL_NOTE;
const long = (label: string) => `Build ${label}. ${'Detailed background for this task with supporting evidence. '.repeat(300)}`;
const user = (text: string) => ({ role: 'user', content: text, timestamp: 0 });
const input = (text = long('the widget')) => ({ reason: 'manual', entries: [], messages: [user(text)], firstKept: 99 });
const notices: string[] = [];
const host = { pip: { ownerOf: () => undefined }, notice: (_level, text) => notices.push(text) };
const api = { conversationId: 1, snapshot: async () => ({ cwd: here }), models: new Proxy({}, { get() { throw Error('model access forbidden'); } }) };

// Runtime stubs intentionally omit unused methods. Integration tests below use real types and APIs.
const invoke = (hook, data) => hook(data, api, H.context);

test('deterministic compiler parity; unmapped messages get no refs; one recall note', async () => {
    const data = input();
    const hook = createBeforeCompact(host as never);
    const first = await invoke(hook, data);
    const second = await invoke(hook, data);
    assert.deepEqual(first, second);
    assert.ok(first.summary, JSON.stringify(notices));
    const segment = compileSegment({ messages: data.messages, cwd: here, sourceIndices: [undefined] });
    assert.equal(first.summary, segment + NOTE);
    assert.match(segment, /\[user\]/);
    assert.doesNotMatch(segment, /#\d+/);
    assert.ok(first.summary.length < data.messages[0].content.length);
});

test('refs are the entry ids of the summarized messages, by identity; unsure ones get none', async () => {
    const a = user(long('alpha'));
    const b = { role: 'assistant', content: [{ type: 'text', text: long('beta') }], stopReason: 'stop', timestamp: 0 };
    const replaced = user(long('replaced by an edit'));
    const shared = user('shared');
    const marker = user(PREFIX + 'old' + SUFFIX);
    const entries = [
        { id: 7, kind: CompactionEntry.kind, model: [marker], head: 9 },
        { id: 41, kind: 'x', model: [a] },
        { id: 42, kind: 'x', model: [b] },
        { id: 43, kind: 'x', model: [shared] },
        { id: 44, kind: 'x', model: [shared] },
    ];
    // A structurally equal copy is not the stored message: identity only.
    assert.deepEqual(sourceIds(entries as never, [marker, a, b, replaced, shared, structuredClone(a)]), [undefined, 41, 42, undefined, undefined, undefined]);
    const data = { reason: 'manual', entries: entries.slice(1, 3), messages: [a, b], firstKept: 99 };
    const { summary } = await invoke(createBeforeCompact(host as never), data);
    assert.match(summary, /\(#41\)/);
    assert.match(summary, /\(#42\)/);
    assert.ok(summary.endsWith(NOTE));
});

test('worker runs under eval launch without inheriting incompatible flags', async () => {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', `
        import { compileInWorker } from './blackhole.ts';
        console.log(await compileInWorker({ messages: [{role:'user',content:'hello',timestamp:0}], sourceIndices:[undefined], cwd:process.cwd() }));
    `], { cwd: here });
    assert.match(stdout, /hello/);
});

test('old native prose is unchanged; repeated compaction compiles fresh messages only', async () => {
    const previous = '## Native notes\nKeep this exact fact.\n\n  Indentation stays.\n## Critical context\nNever lose the key ABC123.';
    const calls = [];
    const hook = createBeforeCompact(host as never, async (data) => {
        calls.push(data);
        return compileSegment(data);
    });
    const append = async (prior, label) => {
        const markerMessage = user(PREFIX + prior + SUFFIX);
        const data = input(long(label));
        data.messages.unshift(markerMessage);
        data.entries = [{ id: 1, conversationId: 1, kind: CompactionEntry.kind, model: [markerMessage], head: 2 }];
        return (await invoke(hook, data)).summary;
    };
    const one = await append(previous, 'first-window');
    const two = await append(one, 'second-window');
    assert.ok(one.startsWith(previous + SEP));
    // Only the adapter's own trailing note moves; everything before it stays byte-for-byte.
    assert.ok(two.startsWith(one.slice(0, -NOTE.length) + SEP));
    assert.ok(one.endsWith(NOTE) && two.endsWith(NOTE));
    assert.equal(two.split(RECALL_NOTE).length - 1, 1);
    assert.equal(two.split(previous).length - 1, 1);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].messages.length, 1);
    assert.doesNotMatch(JSON.stringify(calls[1]), /Native notes|first-window/);
    assert.deepEqual(calls[1].sourceIndices, [undefined]);
});

test('PiP skips without reading input or calling compiler; missing API declines', async () => {
    let calls = 0;
    const compile = async () => { calls++; return ''; };
    const pipHost = { ...host, pip: { ownerOf: () => 'owner' } };
    const result = await invoke(createBeforeCompact(pipHost as never, compile), null);
    assert.equal(result, undefined);
    assert.equal(calls, 0);
    assert.deepEqual(await invoke(createBeforeCompact({ ...host, pip: undefined } as never, compile), input()), { decline: true });
    assert.equal(calls, 0);
});

test('errors, empty, oversized and non-shrinking summaries decline visibly, never use models', async () => {
    for (const compiler of [async () => '', async () => { throw Error('test failure'); }, async () => 'x'.repeat(MAX_SUMMARY_CHARS + 1), async () => 'x'.repeat(100_000)]) {
        const start = notices.length;
        assert.deepEqual(await invoke(createBeforeCompact(host as never, compiler), input()), { decline: true });
        assert.equal(notices.length, start + 1);
        assert.match(notices.at(-1), /Context unchanged; no model fallback/);
    }
    // A real extraction of a tiny input can grow: decline instead of looping compaction.
    assert.deepEqual(await invoke(createBeforeCompact(host as never), input('Hi')), { decline: true });
});

test('multi-megabyte tool results decline before worker, source is not truncated', async () => {
    let called = false;
    const hook = createBeforeCompact(host as never, async () => { called = true; return ''; });
    const data = input();
    data.messages.push({ role: 'toolResult', toolName: 'read', toolCallId: 'a', content: [{ type: 'text', text: 'x'.repeat(MAX_SOURCE_CHARS + 1) }], isError: false, timestamp: 0 });
    assert.deepEqual(await invoke(hook, data), { decline: true });
    assert.equal(called, false);
    assert.match(notices.at(-1), /source exceeds/);
});

test('malformed prior marker declines, and instructions are visibly not interpreted', async () => {
    const bad = input();
    bad.entries = [{ kind: CompactionEntry.kind, model: [user('not the wrapper')] }];
    assert.deepEqual(await invoke(createBeforeCompact(host as never), bad), { decline: true });
    const good = { ...input(), instructions: 'Use a secret custom format.' };
    assert.ok((await invoke(createBeforeCompact(host as never), good)).summary);
    assert.match(notices.at(-1), /instructions are not interpreted/);
});

// A fake reader: visibility is the storage's job, so the fake filters by conversation like Pocket does.
function reader(entries, head, conversationId = 1) {
    return {
        conversationId,
        commit: async (change) => change({
            latestHeadMarker: async () => head,
            scanEntries: async (query, limit) => ({
                items: entries
                    .filter((e) => e.conversationId === query.conversationId
                        && (query.minEntryId === undefined || e.id >= query.minEntryId)
                        && (query.maxEntryId === undefined || e.id <= query.maxEntryId))
                    .sort((x, y) => y.id - x.id)
                    .slice(0, limit),
            }),
        }),
    };
}
const recall = async (api, args) => (await recallTool.execute(args, api, H.context)).content[0].text;

test('recall expands entries in full, pages long ones, and never reads another session', async () => {
    const big = 'B'.repeat(MAX_RECALL_CHARS + 500);
    const entries = [
        { id: 5, conversationId: 1, kind: 'x', model: [user('the exact error: ENOENT /tmp/x')] },
        { id: 6, conversationId: 1, kind: 'x', model: [{ role: 'assistant', content: [{ type: 'thinking', thinking: 'SECRET' }, { type: 'text', text: 'ok' }, { type: 'toolCall', id: 'c', name: 'read', arguments: { path: 'a.ts' } }], timestamp: 0 }] },
        { id: 7, conversationId: 1, kind: 'x', model: [{ role: 'toolResult', toolCallId: 'c', toolName: 'read', content: [{ type: 'text', text: big }], isError: false, timestamp: 0 }] },
        { id: 8, conversationId: 2, kind: 'x', model: [user('other session secret')] },
        { id: 9, conversationId: 1, kind: 'display' },
    ];
    const api = reader(entries, undefined);
    assert.match(await recall(api, { ids: [5] }), /ENOENT \/tmp\/x/);
    const six = await recall(api, { ids: [6] });
    assert.match(six, /\[tool call\] read\(\{"path":"a.ts"\}\)/);
    assert.doesNotMatch(six, /SECRET/, 'thinking is never replayed');
    const first = await recall(api, { ids: [7] });
    assert.ok(first.length <= MAX_RECALL_CHARS + 300);
    assert.match(first, new RegExp(`offset ${MAX_RECALL_CHARS} for more`));
    const rest = await recall(api, { ids: [7], offset: MAX_RECALL_CHARS });
    assert.match(rest, new RegExp(`chars ${MAX_RECALL_CHARS}-(\\d+) of \\1\\)`));
    assert.doesNotMatch(rest, /for more/);
    const other = await recall(api, { ids: [8, 9, 404] });
    assert.doesNotMatch(other, /other session secret/);
    assert.equal(other.split('not found').length - 1, 3);
    await assert.rejects(recall(api, {}), /Give ids, a query, or both/);
});

test('recall search: only compacted entries, newest first, literal terms, paged', async () => {
    const entries = [];
    for (let id = 1; id <= 30; id++) {
        entries.push({ id, conversationId: 1, kind: 'x', model: [user(`note ${id} about widgets.* and gears`)] });
    }
    entries.push({ id: 31, conversationId: 1, kind: CompactionEntry.kind, model: [user('widgets summary')], head: 25 });
    entries.push({ id: 32, conversationId: 1, kind: 'x', model: [user('widgets still in context')] });
    assert.match(await recall(reader(entries, undefined), { query: 'widgets' }), /Nothing in this session has left context/);
    const api = reader(entries, entries[30]);
    const one = await recall(api, { query: 'GEARS widgets.*' });
    const ids = [...one.matchAll(/^#(\d+) /gm)].map((m) => Number(m[1]));
    assert.deepEqual(ids, [24, 23, 22, 21, 20, 19, 18, 17, 16, 15]);
    assert.match(one, /page 2/);
    const three = await recall(api, { query: 'widgets', page: 3 });
    assert.deepEqual([...three.matchAll(/^#(\d+) /gm)].map((m) => Number(m[1])), [4, 3, 2, 1]);
    assert.doesNotMatch(three, /More matches/);
    // Regex syntax is literal text: "w.dgets" matches nothing.
    assert.match(await recall(api, { query: 'w.dgets' }), /No matches/);
    const both = await recall(api, { ids: [3], query: 'gears' });
    assert.match(both, /^#3 \(chars/);
    assert.match(both, /Matches for "gears"/);
});

test('bundle has no memory runtime, external packages, subprocesses, or network code', () => {
    const provenance = JSON.parse(readFileSync(join(here, 'compiler-provenance.json'), 'utf8'));
    assert.ok(provenance.inputs.some((i) => i.path.endsWith('/core/summarize.ts')));
    assert.ok(provenance.inputs.every((i) => !/\/om\/|\/hooks\/|\/index\.(ts|js)$/.test(i.path) || /get-east-asian-width\/index.js$/.test(i.path)));
    assert.ok(provenance.imports.every((i) => i.path === 'node:path'));
    const bundle = readFileSync(join(here, '_blackhole-compiler.js'), 'utf8');
    assert.doesNotMatch(bundle, /node:child_process|node:worker_threads|https?:\/\//);
});

test('real Pocket: summary refs are real entry ids; the model recalls them; forks inherit, other sessions cannot', async () => {
    const data = join(H.root, 'blackhole-recall-data');
    const dropins = join(data, 'extensions');
    mkdirSync(dropins, { recursive: true });
    for (const file of ['blackhole.ts', '_blackhole-compiler.js', '_blackhole-worker.js']) {
        copyFileSync(join(here, file), join(dropins, file));
    }
    const route = (request) => {
        const { role, text } = H.lastText(request);
        if (role === 'toolResult') {
            return fauxAssistantMessage([fauxText(`tool said: ${text}`)]);
        }
        const asked = text.match(/^RECALL (\S+)$/);
        if (asked) {
            const args = /^\d+$/.test(asked[1]) ? { ids: [Number(asked[1])] } : { query: asked[1] };
            return fauxAssistantMessage([fauxToolCall('blackhole_recall', args)], { stopReason: 'toolUse' });
        }
        return fauxAssistantMessage([fauxText('Completed the requested task. '.repeat(40))]);
    };
    const app = await H.openApp(H.scriptedModel(route), data);
    app.settings.getCompactionSettings = () => ({ enabled: true, reserveTokens: 16384, keepRecentTokens: 50 });
    const view = async (id) => (await app.harness.conversation(id, H.context)).context(H.context);
    const answer = async (id, text) => {
        await H.say(app, id, text);
        return (await H.modelTexts(app, id)).at(-1);
    };
    try {
        await app.setExtensionEnabled(H.owner(app), 'blackhole.ts', true);
        const id = await H.newSession(app);
        await H.say(app, id, long('first-window') + ' Exact detail: QUOKKA-7731.');
        await H.say(app, id, long('tail-kept'));
        const before = await view(id);
        const original = before.entries.find((entry) => JSON.stringify(entry.model ?? []).includes('QUOKKA-7731'));
        await app.commands.compact(id, H.owner(app), undefined);
        await H.until(async () => (await view(id)).head !== undefined, 'compaction marker');
        const summary = JSON.stringify((await view(id)).head.model);
        assert.match(summary, new RegExp(`\\(#${original.id}\\)`), 'ref is the real entry id');
        assert.equal(summary.split('blackhole_recall').length - 1, 1, 'one recall note');
        // Every ref the summary carries is an entry of this session.
        const known = new Set(before.entries.map((entry) => Number(entry.id)));
        for (const [, ref] of summary.matchAll(/\(#(\d+)\)/g)) {
            assert.ok(known.has(Number(ref)), `ref #${ref} is an entry of the session`);
        }
        assert.match(await answer(id, `RECALL ${original.id}`), /tool said: #\d+ \(chars[\s\S]*QUOKKA-7731/);
        assert.match(await answer(id, 'RECALL quokka-7731'), new RegExp(`#${original.id} .*QUOKKA-7731`));
        const forkAt = (await view(id)).entries.at(-1).id;
        const { id: fork } = await app.commands.fork(id, H.owner(app), { entryId: Number(forkAt) });
        assert.match(await answer(fork, `RECALL ${original.id}`), /QUOKKA-7731/, 'a fork inherits the history');
        const stranger = await H.newSession(app);
        const denied = await answer(stranger, `RECALL ${original.id}`);
        assert.match(denied, /not found in this session's history/);
        assert.doesNotMatch(denied, /QUOKKA/);
    } finally {
        await app.close();
    }
});

test('real Pocket drop-in loader, native previous summary, retention, repeat, restart, fork, reset, PiP', async () => {
    const data = join(H.root, 'blackhole-data');
    const dropins = join(data, 'extensions');
    mkdirSync(dropins, { recursive: true });
    for (const file of ['blackhole.ts', '_blackhole-compiler.js', '_blackhole-worker.js']) {
        copyFileSync(join(here, file), join(dropins, file));
    }
    let requests = 0;
    let summaries = 0;
    const route = (request) => {
        requests++;
        const text = JSON.stringify(request.messages);
        if (text.includes('context summarization assistant')) {
            summaries++;
            return fauxAssistantMessage([fauxText('## Native goal\nPreserve exact native checkpoint NATIVE-FACT.')]);
        }
        return fauxAssistantMessage([fauxText('Completed the requested task. '.repeat(40))]);
    };
    let app = await H.openApp(H.scriptedModel(route), data);
    const policy = () => { app.settings.getCompactionSettings = () => ({ enabled: true, reserveTokens: 16384, keepRecentTokens: 50 }); };
    policy();
    const view = async (id) => (await app.harness.conversation(id, H.context)).context(H.context);
    const compact = async (id) => {
        const prior = (await view(id)).head?.id;
        await app.commands.compact(id, H.owner(app), undefined);
        await H.until(async () => (await view(id)).head?.id !== prior, 'new compaction marker');
    };
    try {
        const modules = (await app.extensions(H.owner(app))).modules.filter((module) => module.source === 'drop-in');
        assert.deepEqual(modules.map((module) => [module.file, module.enabled]), [['blackhole.ts', false]]);
        const id = await H.newSession(app);
        await H.say(app, id, long('native-first'));
        await H.say(app, id, long('native-second'));
        await compact(id); // Intentionally native, before enabling, to test migration.
        assert.equal(summaries, 1);
        await app.setExtensionEnabled(H.owner(app), 'blackhole.ts', true);
        const loaded = (await app.extensions(H.owner(app))).modules.find((module) => module.file === 'blackhole.ts');
        assert.equal(loaded.error, undefined, JSON.stringify(loaded));
        assert.ok(loaded.extensions.some((extension) => extension.name === 'blackhole-deterministic'));
        await H.say(app, id, long('deterministic-second'));
        await H.say(app, id, long('tail-kept'));
        let before = await view(id);
        const tail = before.entries.at(-1);
        let count = requests;
        await compact(id);
        assert.equal(requests, count, 'no compaction model calls');
        let after = await view(id);
        const summaryOne = JSON.stringify(after.head.model);
        assert.match(summaryOne, /NATIVE-FACT/);
        assert.match(summaryOne, /deterministic-second/);
        assert.deepEqual(after.entries.find((entry) => entry.id === tail.id), tail, 'native kept tail unchanged');
        await H.say(app, id, long('repeat-new-window'));
        await H.say(app, id, long('repeat-kept-tail'));
        count = requests;
        await compact(id);
        assert.equal(requests, count);
        after = await view(id);
        const summaryTwo = JSON.stringify(after.head.model);
        assert.equal(summaryTwo.split('NATIVE-FACT').length - 1, 1);
        assert.match(summaryTwo, /repeat-new-window/);
        const savedHead = after.head;
        // Fork from a reply written after the new marker. Earlier retained
        // replies correctly fork the older as-of context instead.
        await H.say(app, id, 'Reply after compaction for the fork.');
        const forkAt = (await view(id)).entries.at(-1).id;
        const { id: fork } = await app.commands.fork(id, H.owner(app), { entryId: Number(forkAt) });
        assert.deepEqual((await view(fork)).head.model, savedHead.model, 'fork preserves summary');
        await app.close();
        app = await H.openApp(H.scriptedModel(route), data);
        policy();
        assert.deepEqual((await view(id)).head.model, savedHead.model, 'restart preserves summary');
        assert.deepEqual((await view(fork)).head.model, savedHead.model, 'restart preserves fork');
        await H.say(app, id, long('after-restart'));
        await H.say(app, id, long('restart-kept-tail'));
        count = requests;
        await compact(id);
        assert.equal(requests, count, 'enabled drop-in recovers after restart');
        await app.commands.reset(id, H.owner(app), 'New goal RESET-ONLY.');
        assert.doesNotMatch(JSON.stringify((await view(id)).messages), /NATIVE-FACT/);
        await H.say(app, id, long('reset-work'));
        await H.say(app, id, long('reset-tail'));
        count = requests;
        await compact(id);
        assert.equal(requests, count);
        assert.doesNotMatch(JSON.stringify((await view(id)).head.model), /NATIVE-FACT/);
        assert.match(JSON.stringify((await view(id)).head.model), /RESET-ONLY/);
        const small = await H.newSession(app);
        await app.commands.reset(small, H.owner(app), 'Hi');
        await H.say(app, small, 'Hi');
        const smallBefore = await view(small);
        const tab = H.fakeTab(small, H.owner(app));
        app.attach(tab.client);
        count = requests;
        // Break only the isolated copy's worker, not the installed source.
        const workerFile = join(dropins, '_blackhole-worker.js');
        renameSync(workerFile, workerFile + '.disabled');
        try {
            await app.commands.compact(small, H.owner(app), undefined);
            await app.harness.waitForIdle(H.context);
        } finally {
            renameSync(workerFile + '.disabled', workerFile);
        }
        assert.equal(requests, count, 'decline never falls back to the model');
        assert.deepEqual((await view(small)).entries, smallBefore.entries, 'decline leaves context intact');
        assert.ok(tab.events.some((event) => JSON.stringify(event).includes('Blackhole declined compaction')), 'decline notice reaches the session');
        app.detach(tab.client);
        // PiP keeps its built-in summarizer and does not select the ordinary drop-in.
        const pipId = await app.pip.ensure(H.owner(app));
        await app.commands.configure(pipId, H.owner(app), { model: { provider: 'faux', modelId: 'faux-1' }, thinkingLevel: 'off' });
        await H.say(app, pipId, long('pip-first'));
        await H.say(app, pipId, long('pip-tail'));
        count = requests;
        await compact(pipId);
        assert.ok(requests > count, 'PiP native summarizer still calls its selected model');
        assert.doesNotMatch(JSON.stringify((await view(pipId)).head.model), /\[Session Goal\]/);
    } finally {
        await app.close();
        H.cleanUp();
    }
});
