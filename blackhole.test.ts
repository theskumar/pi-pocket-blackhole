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
const { fauxAssistantMessage, fauxText } = await import('@earendil-works/pi-ai/providers/faux');
const { createBeforeCompact, MAX_SOURCE_CHARS, MAX_SUMMARY_CHARS } = await import('./blackhole.ts');
const { compileSegment } = await import('./_blackhole-compiler.js');
const PREFIX = 'The conversation history before this point was compacted into the following summary:\n\n<summary>\n';
const SUFFIX = '\n</summary>';
const long = (label: string) => `Build ${label}. ${'Detailed background for this task with supporting evidence. '.repeat(300)}`;
const user = (text: string) => ({ role: 'user', content: text, timestamp: 0 });
const input = (text = long('the widget')) => ({ reason: 'manual', entries: [], messages: [user(text)], firstKept: 99 });
const notices: string[] = [];
const host = { pip: { ownerOf: () => undefined }, notice: (_level, text) => notices.push(text) };
const api = { conversationId: 1, snapshot: async () => ({ cwd: here }), models: new Proxy({}, { get() { throw Error('model access forbidden'); } }) };

// Runtime stubs intentionally omit unused methods. Integration tests below use real types and APIs.
const invoke = (hook, data) => hook(data, api, H.context);

test('deterministic compiler parity, no generated recall ids or footer', async () => {
    const data = input();
    const hook = createBeforeCompact(host as never);
    const first = await invoke(hook, data);
    const second = await invoke(hook, data);
    assert.deepEqual(first, second);
    assert.ok(first.summary, JSON.stringify(notices));
    assert.equal(first.summary, compileSegment({ messages: data.messages, cwd: here, sourceIndices: [undefined] }));
    assert.match(first.summary, /\[user\]/);
    assert.doesNotMatch(first.summary, /`recall`|#\d+/);
    assert.ok(first.summary.length < data.messages[0].content.length);
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
    assert.ok(one.startsWith(previous + '\n\n---\n\n'));
    assert.ok(two.startsWith(one + '\n\n---\n\n'));
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

test('bundle has no memory runtime, external packages, subprocesses, or network code', () => {
    const provenance = JSON.parse(readFileSync(join(here, 'compiler-provenance.json'), 'utf8'));
    assert.ok(provenance.inputs.some((i) => i.path.endsWith('/core/summarize.ts')));
    assert.ok(provenance.inputs.every((i) => !/\/om\/|\/hooks\/|\/index\.(ts|js)$/.test(i.path) || /get-east-asian-width\/index.js$/.test(i.path)));
    assert.ok(provenance.imports.every((i) => i.path === 'node:path'));
    const bundle = readFileSync(join(here, '_blackhole-compiler.js'), 'utf8');
    assert.doesNotMatch(bundle, /node:child_process|node:worker_threads|https?:\/\//);
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
