import { vi } from 'vitest';
import axios from 'axios';
const deny = () => { throw new Error('R539_NETWORK_DENIED'); };
vi.stubGlobal('fetch', deny);
vi.stubGlobal('XMLHttpRequest', class { constructor() { deny(); } });
vi.stubGlobal('WebSocket', class { constructor() { deny(); } });
axios.defaults.adapter = deny;
vi.stubGlobal('crypto', { randomUUID: vi.fn(() => '11111111-1111-4111-8111-111111111111'), subtle: { digest: deny }, getRandomValues: deny });
vi.mock('@noble/hashes/sha2.js', () => ({ sha256: (bytes: Uint8Array) => {
  const result = new Uint8Array(32);
  bytes.forEach((byte, index) => { result[index % 32] = (result[index % 32] * 33 + byte) % 256; });
  return result;
} }));

import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
for (const mod of [http, https]) { mod.request = deny as typeof mod.request; mod.get = deny as typeof mod.get; }
for (const mod of [net, tls]) { mod.connect = deny as typeof mod.connect; }
net.createConnection = deny as typeof net.createConnection;
