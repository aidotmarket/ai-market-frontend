import { defineConfig } from '../node_modules/vitest/dist/config.js';
export default defineConfig({ test: { environment: 'node', maxWorkers: 1, setupFiles: ['.r539-private/setup.ts'] } });
