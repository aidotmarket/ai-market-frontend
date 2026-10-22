const deny = () => { throw new Error('R539_NETWORK_DENIED'); };
for (const mod of ['http', 'https']) { const m = require(mod); m.request = deny; m.get = deny; }
for (const mod of ['net', 'tls']) { const m = require(mod); m.connect = deny; if (m.createConnection) m.createConnection = deny; }
globalThis.fetch = deny;
globalThis.XMLHttpRequest = class { constructor() { deny(); } };
globalThis.WebSocket = class { constructor() { deny(); } };

const crypto = require('node:crypto');
for (const name of ['randomBytes','randomFill','randomFillSync','createHash','createHmac','pbkdf2','pbkdf2Sync','scrypt','scryptSync','sign','verify','generateKeyPair','generateKeyPairSync']) crypto[name] = deny;
crypto.randomUUID = () => '11111111-1111-4111-8111-111111111111';

require('node:module').syncBuiltinESMExports();

for (const name of ['encrypt','decrypt','sign','verify','digest','deriveBits','deriveKey','generateKey','importKey','exportKey','wrapKey','unwrapKey']) crypto.webcrypto.subtle[name] = deny;
Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { randomUUID: crypto.randomUUID, getRandomValues: deny, subtle: crypto.webcrypto.subtle } });

// Deterministic compiler trace identity avoids Next's native randomBytes.
process.env.NEXT_PRIVATE_TRACE_ID = '1111111111111111';

require('node:net').Socket.prototype.connect = deny;
require('node:net').Server.prototype.listen = deny;
require('node:dgram').createSocket = deny;
require('node:http2').connect = deny;
crypto.randomInt = deny;
crypto.getRandomValues = deny;
require('node:module').syncBuiltinESMExports();
