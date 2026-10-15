/** Compile ordinary sessions into deterministic Blackhole summaries without model requests. */
import { Worker } from 'node:worker_threads';
import { AgentDoc, CompactionEntry, CompactionTask, defineExtension, hook } from '@earendil-works/pi-durable';
import type { CompactionHooks } from '@earendil-works/pi-durable';
import type { Message } from '@earendil-works/pi-ai';
import { estimateMessageTokens } from '@earendil-works/pi-ai/utils/estimate';
import type { PocketHost } from '/Users/theskumar/code/pi-pocket/src/server/host.ts';

type Input = Parameters<CompactionHooks['beforeCompact']>[0];
type CompilerInput = { messages: Message[]; sourceIndices: undefined[]; cwd: string };
type Compiler = (input: CompilerInput) => Promise<string>;
type Host = Pick<PocketHost, 'pip' | 'notice'>;
const PREFIX = 'The conversation history before this point was compacted into the following summary:\n\n<summary>\n';
const SUFFIX = '\n</summary>';
export const MAX_SOURCE_CHARS = 8 * 1024 * 1024;
export const MAX_SUMMARY_CHARS = 1024 * 1024;

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
        const worker = new Worker(new URL('./_blackhole-worker.js', import.meta.url), {
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
                // Pocket entry ids are not Blackhole recall ids. Disable all generated refs.
                sourceIndices: Array(fresh.length).fill(undefined),
                cwd: agent?.cwd ?? process.cwd(),
            });
            if (!segment.trim()) {
                throw new Error('compiler returned an empty summary');
            }
            const summary = previous ? `${previous}\n\n---\n\n${segment}` : segment;
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
    // Keep native prose and prior segments byte-for-byte, without recompiling them.
    return { previous: text.slice(PREFIX.length, -SUFFIX.length), fresh: input.messages.slice(1) };
}

export default function blackhole(host: Host) {
    return defineExtension({
        name: 'blackhole-deterministic',
        hooks: [hook(CompactionTask, { beforeCompact: createBeforeCompact(host) })],
    });
}
