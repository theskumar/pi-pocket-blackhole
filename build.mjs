import { spawn } from 'node:child_process';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const upstream = '/Users/theskumar/.pi/agent/npm/node_modules/pi-blackhole';
const metadataFile = '_compiler-metafile.json';
// The pi-tui barrel has unrelated terminal initialization. Resolve its one
// required export directly to the same upstream implementation.
const args = [
    '--bundle', '--platform=node', '--format=esm', '--target=node24',
    '--loader=ts', '--sourcefile=compiler-entry.ts',
    '--outfile=_blackhole-compiler.js', `--metafile=${metadataFile}`,
    '--legal-comments=eof',
    '--alias:@earendil-works/pi-tui=/Users/theskumar/.pi/agent/npm/node_modules/@earendil-works/pi-tui/dist/utils.js',
    '--banner:js=/* pi-blackhole 0.5.11 compiler. MIT, Copyright (c) 2026 k0valik. See THIRD_PARTY_LICENSES.md. */',
];
await new Promise((resolve, reject) => {
    const child = spawn('/Users/theskumar/code/pi-pocket/node_modules/.bin/esbuild', args, {
        stdio: ['pipe', 'inherit', 'inherit'],
    });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`esbuild exited ${code}`)));
    child.stdin.end(`export { compileSegment } from ${JSON.stringify(`${upstream}/src/core/summarize.ts`)};`);
});
const metadata = JSON.parse(await readFile(metadataFile, 'utf8'));
await unlink(metadataFile);
const output = Object.values(metadata.outputs).find((value) => value.entryPoint);
const inputs = Object.entries(output.inputs).filter(([, value]) => value.bytesInOutput > 0);
const graph = [];
for (const [path, contribution] of inputs) {
    if (path === 'compiler-entry.ts') continue;
    const data = await readFile(path);
    graph.push({ path, bytesInOutput: contribution.bytesInOutput, sha256: createHash('sha256').update(data).digest('hex') });
}
await writeFile('compiler-provenance.json', JSON.stringify({ upstream: 'pi-blackhole@0.5.11', inputs: graph, imports: output.imports }, null, 2) + '\n');
console.log(`Bundled ${inputs.length} contributing inputs, ${output.bytes} bytes`);
