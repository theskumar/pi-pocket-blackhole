// Print the Pi Pocket gallery entry (entries/blackhole.json in the index repository) for one commit.
//
//   node scripts/gallery-entry.mjs [commit]      default: HEAD, which must be pushed
//
// File sizes and hashes come from the commit, not the working tree. The test suite checks that `declares` and the
// description match what Pi Pocket's own Share… draft reports for the loaded module.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const NAME = 'blackhole';
export const FILES = ['blackhole.ts', 'blackhole/compiler.ts', 'blackhole/THIRD_PARTY_LICENSES.md', 'blackhole/worker.ts'];
export const DECLARES = {
    extensions: ['blackhole-deterministic'],
    tools: ['blackhole_recall'],
    readOnlyTools: ['blackhole_recall'],
    hooks: ['beforeCompact'],
    sections: [],
    wraps: [],
    routes: [],
    client: null,
    access: 'owner',
    commands: ['conversation blackhole-status'],
};

/** The first paragraph of the module's doc comment, as Pi Pocket's Share… reads it. */
export function docDescription(source) {
    const comment = /^\s*\/\*\*([\s\S]*?)\*\//.exec(source)?.[1] ?? '';
    const paragraph = comment.replace(/^\s*\* ?/gm, '').trim().split(/\n\s*\n/)[0] ?? '';
    return paragraph.replace(/\s+/g, ' ').trim();
}

/** The entry, given a reader of each file's bytes and the full commit id. */
export function buildEntry(read, commit, version) {
    const files = FILES.map((name) => {
        const bytes = read(name);
        return { name, sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.byteLength };
    });
    return {
        name: NAME,
        title: 'Blackhole compaction',
        description: docDescription(read('blackhole.ts').toString('utf8')),
        tags: ['compaction', 'context', 'recall', 'deterministic'],
        author: { name: 'Saurabh Kumar', github: 'theskumar' },
        version,
        source: { repo: 'theskumar/pi-pocket-blackhole', commit, path: '' },
        files,
        pocketApi: 1,
        minPocket: '0.16.0',
        declares: DECLARES,
    };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const cwd = dirname(dirname(fileURLToPath(import.meta.url)));
    const git = (...args) => execFileSync('git', args, { cwd, maxBuffer: 16 * 1024 * 1024 });
    const commit = git('rev-parse', `${process.argv[2] ?? 'HEAD'}^{commit}`).toString().trim();
    const version = JSON.parse(git('show', `${commit}:package.json`).toString()).version;
    const entry = buildEntry((name) => git('show', `${commit}:${name}`), commit, version);
    process.stdout.write(JSON.stringify(entry, null, 4) + '\n');
}
