/**
 * Replaces ordinary sessions' compaction summaries with deterministic pi-blackhole extraction, with no model calls. Summary lines carry refs to the original messages, and the read-only tool blackhole_recall reads them back or searches compacted history, only within the calling session and its fork ancestry. No network access and no files outside the module. PiP keeps its own summarizer.
 *
 * Source, tests, and build steps: https://github.com/theskumar/pi-pocket-blackhole
 */
import { Worker } from 'node:worker_threads';
import { AgentDoc, CompactionEntry, CompactionTask, defineExtension, defineTool, hook } from '@earendil-works/pi-durable';
import type { CompactionHooks, EntryId, EntryRecord, ToolExecutionApi, Tx } from '@earendil-works/pi-durable';
import { Type } from '@earendil-works/pi-ai';
import type { Message } from '@earendil-works/pi-ai';
import { estimateMessageTokens } from '@earendil-works/pi-ai/utils/estimate';

type Input = Parameters<CompactionHooks['beforeCompact']>[0];
type CompilerInput = { messages: Message[]; sourceIndices: (number | undefined)[]; cwd: string };
type Compiler = (input: CompilerInput) => Promise<string>;
// The two members of Pi Pocket's host that this module uses (types/pocket.d.ts in Pi Pocket).
type Host = {
    readonly pip?: { ownerOf(conversationId: number): string | undefined };
    notice(level: 'info' | 'warning' | 'error', message: string, conversationId?: number): void;
};
const PREFIX = 'The conversation history before this point was compacted into the following summary:\n\n<summary>\n';
const SUFFIX = '\n</summary>';
export const MAX_SOURCE_CHARS = 8 * 1024 * 1024;
export const MAX_SUMMARY_CHARS = 1024 * 1024;
export const RECALL_TOOL = 'blackhole_recall';
// One trailing note per summary. Each compaction moves it to the new end.
export const RECALL_NOTE = `Refs like (#N) are ids of original messages. Call \`${RECALL_TOOL}\` with ids [N] to read one in full, or with a query to search history that is no longer in context. Do not redo completed work.`;
const SEPARATOR = '\n\n---\n\n';

// Bound both the structured-clone payload and traversal before starting a worker.
// Images and tool arguments count too. A large source is declined, never truncated.
function bounded(value: unknown): void {
    const pending: unknown[] = [value];
    let chars = 0;
    let nodes = 0;
    while (pending.length > 0) {
        const item = pending.pop();
        nodes += 1;
        if (nodes > 100_000) {
            throw new Error('source has too many values');
        }
        if (typeof item === 'string') {
            chars += item.length;
        } else if (item !== null && typeof item === 'object') {
            for (const key of Object.keys(item)) {
                chars += key.length;
                pending.push((item as Record<string, unknown>)[key]);
                if (pending.length > 100_000) {
                    throw new Error('source has too many values');
                }
            }
        }
        if (chars > MAX_SOURCE_CHARS) {
            throw new Error('source exceeds 8 MiB character limit');
        }
    }
}

export function compileInWorker(input: CompilerInput): Promise<string> {
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./blackhole/worker.ts', import.meta.url), {
            workerData: input,
            // This worker is plain bundled JS. Do not inherit eval flags, custom
            // loaders, or V8 flags that Node rejects when passed to workers.
            execArgv: [],
            resourceLimits: { maxOldGenerationSizeMb: 128 },
        });
        const timer = setTimeout(() => finish(new Error('compiler timed out after 5 seconds')), 5000);
        let finished = false;
        function finish(error?: Error, summary?: string): void {
            if (finished) {
                return;
            }
            finished = true;
            clearTimeout(timer);
            void worker.terminate();
            if (error) {
                reject(error);
            } else {
                resolve(summary!);
            }
        }
        worker.once('message', (result) => {
            if (typeof result?.summary !== 'string') {
                finish(new Error('compiler failed'));
            } else {
                finish(undefined, result.summary);
            }
        });
        worker.once('error', () => finish(new Error('compiler worker failed')));
        worker.once('exit', () => finish(new Error('compiler worker exited without a summary')));
    });
}

// Exported for direct failure-path tests. Production always uses the bundled worker.
export function createBeforeCompact(host: Host, compiler: Compiler = compileInWorker): CompactionHooks['beforeCompact'] {
    return async (input, api, context) => {
        try {
            // Missing PiP detection is unsafe: decline instead of guessing.
            if (typeof host.pip?.ownerOf !== 'function') {
                throw new Error('PiP ownership API unavailable');
            }
            if (host.pip.ownerOf(api.conversationId) !== undefined) {
                return undefined;
            }
            bounded(input.messages);
            const { previous, fresh } = splitPrevious(input);
            const agent = await api.snapshot(AgentDoc, api.conversationId, context);
            const segment = await compiler({
                messages: [...fresh],
                // Refs are Pocket entry ids, which blackhole_recall resolves.
                sourceIndices: sourceIds(input.entries, fresh),
                cwd: agent?.cwd ?? process.cwd(),
            });
            if (!segment.trim()) {
                throw new Error('compiler returned an empty summary');
            }
            const body = previous ? `${previous}${SEPARATOR}${segment}` : segment;
            const summary = `${body}${SEPARATOR}${RECALL_NOTE}`;
            if (summary.length > MAX_SUMMARY_CHARS) {
                throw new Error('summary exceeds 1 MiB character limit');
            }
            // System/tool definitions are reinserted by generation. Counting
            // them as savings could accept an append that actually grows context.
            const before = input.messages.reduce((sum, message) =>
                sum + (message.role === 'system' ? 0 : estimateMessageTokens(message)), 0);
            const after = estimateMessageTokens({ role: 'user', content: PREFIX + summary + SUFFIX, timestamp: 0 });
            if (after >= before) {
                throw new Error('summary does not reduce estimated context tokens');
            }
            if (input.instructions) {
                host.notice('info', 'Blackhole uses deterministic extraction. Custom compaction instructions are not interpreted.', api.conversationId);
            }
            return { summary };
        } catch (error) {
            // Never return undefined here: that would invoke the native model summarizer.
            const reason = error instanceof Error ? error.message : 'unknown compiler error';
            host.notice('warning', `Blackhole declined compaction: ${reason}. Context unchanged; no model fallback.`, api.conversationId);
            return { decline: true };
        }
    };
}

/**
 * The entry id of each fresh message, or undefined (no ref) when unsure. Messages are the same frozen objects as the
 * entries' model messages, so identity maps them. Messages that an edit replaced, synthesized missing tool results,
 * and summary markers map to nothing.
 */
export function sourceIds(entries: readonly EntryRecord[], fresh: readonly Message[]): (number | undefined)[] {
    const owner = new Map<Message, number>();
    const ambiguous = new Set<Message>();
    for (const entry of entries) {
        if (entry.head !== undefined) {
            continue;
        }
        for (const message of entry.model ?? []) {
            if (owner.has(message)) {
                ambiguous.add(message);
            }
            owner.set(message, Number(entry.id));
        }
    }
    return fresh.map((message) => (ambiguous.has(message) ? undefined : owner.get(message)));
}

function stripRecallNote(text: string): string {
    const note = SEPARATOR + RECALL_NOTE;
    return text.endsWith(note) ? text.slice(0, -note.length) : text;
}

function splitPrevious(input: Input): { previous: string; fresh: readonly Message[] } {
    if (!CompactionEntry.is(input.entries[0])) {
        return { previous: '', fresh: input.messages };
    }
    const marker = input.entries[0];
    const model = marker.model;
    const first = input.messages[0];
    if (model?.length !== 1 || JSON.stringify(first) !== JSON.stringify(model[0]) || first?.role !== 'user') {
        throw new Error('unrecognized previous compaction marker');
    }
    const text = typeof first.content === 'string'
        ? first.content
        : first.content.map((part) => {
            if (part.type !== 'text') {
                throw new Error('non-text previous compaction marker');
            }
            return part.text;
        }).join('');
    if (!text.startsWith(PREFIX) || !text.endsWith(SUFFIX)) {
        throw new Error('unrecognized previous summary wrapper');
    }
    // Keep native prose and prior segments byte-for-byte, without recompiling them. Only this adapter's own
    // trailing recall note is removed, and the new summary adds it back at its end.
    return { previous: stripRecallNote(text.slice(PREFIX.length, -SUFFIX.length)), fresh: input.messages.slice(1) };
}

// ── Recall ──────────────────────────────────────────────────────────────

export const MAX_RECALL_CHARS = 24_000;
const MAX_IDS = 20;
const MAX_SCAN_ENTRIES = 10_000;
const MAX_SEARCH_TEXT = 1024 * 1024;
const PAGE_SIZE = 10;
const SCAN_PAGE = 256;
const SNIPPET = 160;

type Reader = Pick<ToolExecutionApi, 'conversationId' | 'commit'>;
type Context = Parameters<ToolExecutionApi['commit']>[1];

function partText(part: { type: string; text?: string; name?: string; arguments?: unknown }): string {
    if (part.type === 'text') {
        return part.text ?? '';
    }
    if (part.type === 'toolCall') {
        return `[tool call] ${part.name}(${JSON.stringify(part.arguments ?? {})})`;
    }
    if (part.type === 'image') {
        return '[image]';
    }
    // Thinking is private reasoning, often redacted or signed: never replayed.
    return '';
}

/** The model-facing text of one entry, as plain text. Undefined for entries without model messages. */
export function entryText(entry: EntryRecord): string | undefined {
    const messages = entry.model ?? [];
    if (messages.length === 0) {
        return undefined;
    }
    return messages.map((message) => {
        const content = message.content as string | { type: string }[];
        const body = typeof content === 'string'
            ? content
            : content.map((part) => partText(part)).filter(Boolean).join('\n');
        const label = message.role === 'toolResult'
            ? `[tool result: ${message.toolName}${message.isError ? ', error' : ''}]`
            : `[${message.role}]`;
        return `${label}\n${body}`;
    }).join('\n\n');
}

/** A visible entry of the conversation: its own, or one a fork inherited. Never another session's. */
async function visibleEntry(api: Reader, id: number, context: Context): Promise<EntryRecord | undefined> {
    return api.commit(async (tx: Tx) => {
        const page = await tx.scanEntries({
            conversationId: api.conversationId,
            minEntryId: id as EntryId,
            maxEntryId: id as EntryId,
        }, 1);
        return page.items[0];
    }, context);
}

async function expand(api: Reader, ids: readonly number[], offset: number, budget: number, context: Context): Promise<string> {
    const share = Math.floor(budget / ids.length);
    const blocks: string[] = [];
    for (const id of ids) {
        const entry = await visibleEntry(api, id, context);
        const text = entry === undefined ? undefined : entryText(entry);
        if (text === undefined) {
            blocks.push(`#${id}: not found in this session's history.`);
            continue;
        }
        const start = Math.min(offset, text.length);
        const end = Math.min(text.length, start + share);
        let block = `#${id} (chars ${start}-${end} of ${text.length})\n${text.slice(start, end)}`;
        if (end < text.length) {
            block += `\n… [truncated. Call ${RECALL_TOOL} with ids [${id}] and offset ${end} for more.]`;
        }
        blocks.push(block);
    }
    return blocks.join('\n\n');
}

function snippet(text: string, at: number): string {
    const start = Math.max(0, at - SNIPPET / 2);
    const end = Math.min(text.length, start + SNIPPET);
    return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ')}${end < text.length ? '…' : ''}`;
}

/** Literal, case-insensitive search of entries no longer in context, newest first. No regex: no catastrophic patterns. */
async function search(api: Reader, query: string, page: number, budget: number, context: Context): Promise<string> {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) {
        throw new Error('query has no terms');
    }
    const head = await api.commit((tx: Tx) => tx.latestHeadMarker(api.conversationId), context);
    if (head === undefined) {
        return 'Nothing in this session has left context yet.';
    }
    const hits: string[] = [];
    const skip = (page - 1) * PAGE_SIZE;
    let matched = 0;
    let scanned = 0;
    let max = Number(head.head) - 1;
    let more = false;
    while (max > 0 && scanned < MAX_SCAN_ENTRIES) {
        const items = await api.commit(async (tx: Tx) => (await tx.scanEntries({
            conversationId: api.conversationId,
            maxEntryId: max as EntryId,
            order: 'descending',
        }, SCAN_PAGE)).items, context);
        if (items.length === 0) {
            break;
        }
        for (const entry of items) {
            scanned += 1;
            const text = entry.head === undefined ? entryText(entry)?.slice(0, MAX_SEARCH_TEXT) : undefined;
            const lower = text?.toLowerCase();
            if (text === undefined || !terms.every((term) => lower!.includes(term))) {
                continue;
            }
            matched += 1;
            if (matched > skip + PAGE_SIZE) {
                more = true;
                break;
            }
            if (matched > skip) {
                hits.push(`#${entry.id} ${snippet(text, lower!.indexOf(terms[0]!))}`);
            }
        }
        if (more) {
            break;
        }
        max = Number(items.at(-1)!.id) - 1;
    }
    const limited = scanned >= MAX_SCAN_ENTRIES ? ` Stopped after the newest ${MAX_SCAN_ENTRIES} entries.` : '';
    if (hits.length === 0) {
        return `No matches for "${query}" on page ${page}.${limited} Try fewer terms.`;
    }
    const footer = more ? `\n\nMore matches: call ${RECALL_TOOL} with page ${page + 1}.` : '';
    const text = `Matches for "${query}", newest first (page ${page}). Expand one with ids [N].${limited}\n\n${hits.join('\n')}${footer}`;
    return text.slice(0, budget);
}

export const recallTool = Object.assign(defineTool({
    name: RECALL_TOOL,
    description: 'Read original messages that compaction summarized. ids: expand refs such as (#N) in full. query: '
        + 'search history no longer in context; case-insensitive literal text, every term must match.',
    parameters: Type.Object({
        ids: Type.Optional(Type.Array(Type.Integer({ minimum: 1 }), {
            maxItems: MAX_IDS,
            description: 'Entry ids from refs such as (#N), without the #.',
        })),
        query: Type.Optional(Type.String({ maxLength: 500, description: 'Words to find. Every word must match.' })),
        offset: Type.Optional(Type.Integer({ minimum: 0, description: 'Character offset, to page a long entry.' })),
        page: Type.Optional(Type.Integer({ minimum: 1, description: 'Results page of a query. Default 1.' })),
    }),
    replay: 'safe',
    execute: async (args, api, context) => {
        const ids = [...new Set(args.ids ?? [])];
        if (ids.length === 0 && !args.query?.trim()) {
            throw new Error('Give ids, a query, or both.');
        }
        const query = args.query?.trim() ?? '';
        // Both together share one response budget.
        const budget = ids.length > 0 && query ? MAX_RECALL_CHARS / 2 : MAX_RECALL_CHARS;
        const parts: string[] = [];
        if (ids.length > 0) {
            parts.push(await expand(api, ids, args.offset ?? 0, budget, context));
        }
        if (query) {
            parts.push(await search(api, query, args.page ?? 1, budget, context));
        }
        return { content: [{ type: 'text' as const, text: parts.join('\n\n') }] };
    },
}), { annotations: { readOnlyHint: true } });

export default function blackhole(host: Host) {
    return defineExtension({
        name: 'blackhole-deterministic',
        tools: [recallTool],
        hooks: [hook(CompactionTask, { beforeCompact: createBeforeCompact(host) })],
    });
}
