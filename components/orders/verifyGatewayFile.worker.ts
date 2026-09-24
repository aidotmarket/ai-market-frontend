import { sha256 } from '@noble/hashes/sha2.js';

const chunkSize = 8 * 1024 * 1024;

self.onmessage = async (event: MessageEvent<{ file: File; expected: string }>) => {
  try {
    const { file, expected } = event.data;
    const hash = sha256.create();
    for (let offset = 0; offset < file.size; offset += chunkSize) {
      hash.update(new Uint8Array(await file.slice(offset, offset + chunkSize).arrayBuffer()));
      self.postMessage({ progress: Math.min(100, Math.round(100 * (offset + chunkSize) / file.size)) });
    }
    const actual = Array.from(hash.digest(), (byte) => byte.toString(16).padStart(2, '0')).join('');
    self.postMessage({ result: actual === expected.toLowerCase() ? 'match' : 'mismatch' });
  } catch {
    self.postMessage({ result: 'error' });
  }
};
