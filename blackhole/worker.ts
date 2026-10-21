import { parentPort, workerData } from 'node:worker_threads';
import { compileSegment } from './compiler.ts';

try {
    parentPort.postMessage({ summary: compileSegment(workerData) });
} catch {
    parentPort.postMessage({ error: true });
}
