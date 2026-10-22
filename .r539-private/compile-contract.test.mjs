import { it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
it('installed Next server define mapping compiles the route identity independent of runtime env', async () => {
  const { defaultConfig } = require('next/dist/server/config-shared');
  const { getDefineEnv } = require('next/dist/build/define-env');
  const wrapper = require('next/dist/compiled/webpack/webpack');
  wrapper.init();
  for (const revision of ['ab'.repeat(20), '']) {
    const config = { ...defaultConfig, env: { FRONTEND_BUILD_REVISION: revision } };
    const definitions = getDefineEnv({ config, isNodeServer: true, dev: false, isClient: false,
      isEdgeServer: false, isTurbopack: false, hasRewrites: false,
      distDir: resolve('.r539-private'), projectPath: process.cwd() });
    expect(definitions['process.env.FRONTEND_BUILD_REVISION']).toBe(JSON.stringify(revision));
    const filename = revision ? 'compiled-known.cjs' : 'compiled-unknown.cjs';
    await new Promise((resolveBuild, reject) => {
      const compiler = wrapper.webpack({ mode: 'production', target: 'node',
        entry: resolve('app/api/build-revision/route.ts'),
        output: { path: resolve('.r539-private'), filename, library: { type: 'commonjs2' } },
        optimization: { minimize: false },
        plugins: [new wrapper.webpack.DefinePlugin(definitions)] });
      compiler.run((error, stats) => compiler.close(closeError => {
        if (error || closeError || stats.hasErrors()) reject(error || closeError || new Error(stats.toString()));
        else resolveBuild();
      }));
    });
    process.env.FRONTEND_BUILD_REVISION = 'cd'.repeat(20);
    process.env.RAILWAY_GIT_COMMIT_SHA = 'ef'.repeat(20);
    const compiled = require(resolve('.r539-private', filename));
    const response = compiled.GET();
    expect(await response.json()).toEqual({ revision: revision || null });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(compiled.dynamic).toBe('force-dynamic');
  }
});
