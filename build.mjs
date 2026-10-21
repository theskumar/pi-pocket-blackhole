// Bundle pi-blackhole's compileSegment dependency graph into blackhole/compiler.ts.
//
// Inputs come from build/, a package with pinned versions and a lockfile:
//   npm ci --prefix build --ignore-scripts --legacy-peer-deps
// PI_BLACKHOLE_DIR and ESBUILD override the package folder and the esbuild executable.
import { spawn } from 'node:child_process';
import { readFile, writeFile, unlink, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '0.5.11';
const here = dirname(fileURLToPath(import.meta.url));
const upstream = await realpath(process.env.PI_BLACKHOLE_DIR ?? join(here, 'build/node_modules/pi-blackhole'));
const esbuild = process.env.ESBUILD ?? join(here, 'build/node_modules/.bin/esbuild');
// Resolve upstream's dependencies the way Node does from the package: its own node_modules, then its parent's.
const modules = dirname(upstream);

const found = JSON.parse(await readFile(join(upstream, 'package.json'), 'utf8')).version;
if (found !== VERSION) {
    throw new Error(`pi-blackhole ${found} found at ${upstream}; this build pins ${VERSION}`);
}

const outfile = join(here, 'blackhole/compiler.ts');
const metadataFile = join(here, '_compiler-metafile.json');
// The pi-tui barrel has unrelated terminal initialization. Resolve its one
// required export directly to the same upstream implementation.
const args = [
    '--bundle', '--platform=node', '--format=esm', '--target=node24',
    '--loader=ts', '--sourcefile=compiler-entry.ts',
    `--outfile=${outfile}`, `--metafile=${metadataFile}`,
    '--legal-comments=eof',
    `--alias:@earendil-works/pi-tui=${join(modules, '@earendil-works/pi-tui/dist/utils.js')}`,
    `--banner:js=/* pi-blackhole ${VERSION} compiler. MIT, Copyright (c) 2026 k0valik. See THIRD_PARTY_LICENSES.md. Built by build.mjs from https://github.com/theskumar/pi-pocket-blackhole. */`,
];
await new Promise((resolve, reject) => {
    // Run from the packages folder, so the bundle's path comments name packages, not this machine.
    const child = spawn(esbuild, args, { cwd: modules, stdio: ['pipe', 'inherit', 'inherit'] });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`esbuild exited ${code}`)));
    child.stdin.end(`export { compileSegment } from ${JSON.stringify(join(upstream, 'src/core/summarize.ts'))};`);
});
const metadata = JSON.parse(await readFile(metadataFile, 'utf8'));
await unlink(metadataFile);
const output = Object.values(metadata.outputs).find((value) => value.entryPoint);
const inputs = Object.entries(output.inputs).filter(([, value]) => value.bytesInOutput > 0);
const graph = [];
for (const [path, contribution] of inputs) {
    if (path === 'compiler-entry.ts') continue;
    const data = await readFile(join(modules, path));
    graph.push({ path: relative(modules, join(modules, path)), bytesInOutput: contribution.bytesInOutput, sha256: createHash('sha256').update(data).digest('hex') });
}
await writeFile(join(here, 'compiler-provenance.json'), JSON.stringify({ upstream: `pi-blackhole@${VERSION}`, inputs: graph, imports: output.imports }, null, 2) + '\n');
console.log(`Bundled ${inputs.length} contributing inputs, ${output.bytes} bytes`);
