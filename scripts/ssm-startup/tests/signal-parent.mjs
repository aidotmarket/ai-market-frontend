import { readFileSync } from 'node:fs';
import { supervise, Cancelled } from '../loader.mjs';
const input = JSON.parse(readFileSync(0, 'utf8'));
try {
  await supervise(input.document, input, {
    executable: process.execPath, worker: process.argv[2],
    onSpawn(child) {
      child.stdio[3].once('data', () => process.stdout.write(String(child.pid) + '\n'));
    },
  });
  process.exit(79);
} catch (e) {
  if (e instanceof Cancelled) process.kill(process.pid, e.signal);
  else process.exit(78);
}
