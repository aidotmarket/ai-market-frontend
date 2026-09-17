import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const server = await createServer({root, configFile: false,
  resolve: {alias: [
    {find: '@', replacement: root},
  ]},
  define: {'process.env.NEXT_PUBLIC_API_URL': JSON.stringify('https://api.preview.test'), 'process.env.API_URL': 'undefined'},
  esbuild: {jsx: 'automatic'}, server: {host: '127.0.0.1', port: 4178, strictPort: true},
});
await server.listen();
