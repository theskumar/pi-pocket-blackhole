import { parentPort, workerData } from 'node:worker_threads';
import { compileSegment } from './_blackhole-compiler.js';

try {
    parentPort.postMessage({ summary: compileSegment(workerData) });
} catch {
    parentPort.postMessage({ error: true });
}
