import { rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const target = resolve(process.cwd(), 'dist/model');

try {
  const info = await stat(target);
  if (info.isDirectory()) {
    await rm(target, { recursive: true, force: true });
    console.log(`[cleanup-model] Removed dist/model (${target}).`);
  }
} catch (error) {
  if ((error && error.code) === 'ENOENT') {
    console.log('[cleanup-model] dist/model not found, nothing to clean.');
  } else {
    console.warn('[cleanup-model] Failed to remove dist/model:', error);
    process.exitCode = 0;
  }
}
