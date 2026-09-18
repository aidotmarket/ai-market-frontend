import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {describe, expect, it, vi} from 'vitest';
import type {Binding, Checkpoint, Commitment, Descriptor, PlatformEnvelope, Proof, TrustedCheckpoint} from './types';
import {LIMITS} from './types';
import {b64, canonical, hex, inclusion, jcs, leaf, node, parseJson, sha, unb64, utf8, verifyEd25519} from './primitives';
import {canonicalRow, schemaDescriptors} from './canonical-row';
import {checkpointBytes, commitmentBytes, disclosureBytes, platformBytes, proofBytes, sampleHash, verifyLog, verifyManifest, verifyPackage, verifySignatures} from './verifier';
import {producerV2ManifestFixture} from '@/tests/producerPreviewFixture';

// Exact shared files are never rewritten to fit the TypeScript implementation.
const bytes = (name: string) => readFileSync(`tests/fixtures/preview/${name}`);
const fixture = (name: string) => JSON.parse(bytes(name).toString());
const signing = fixture('aim_preview_signing_v1.json');
const requests = fixture('aim_preview_requests_v1.json');
const differential = fixture('aim_preview_differential_v1.json');
const base = fixture('aim_dataset_merkle_v1.json');
const keys = {[signing.platform_envelope.key_id]: signing.signatures.find((s: {name: string}) => s.name === 'platform-envelope').public_key};
const at = Date.parse('2026-09-17T00:00:01Z');

describe('byte-identical producer/backend corpus', () => {
  for (const pin of fixture('preview-fixture-manifest.json')) it(pin.path, () => {
    expect(createHash('sha256').update(bytes(pin.path.split('/').pop())).digest('hex')).toBe(pin.sha256);
  });
  it('verifies the shared complete manifest end-to-end with its trusted platform key', async () => {
    const {manifest} = producerV2ManifestFixture();
    expect(manifest.proofs.every(proof => proof.scan_policy === 'aim-preview-policy-v2' && proof.scan_policy_version === '2.0.0')).toBe(true);
    await expect(verifyManifest(manifest, keys, manifest.listing_id, at)).resolves.toEqual(manifest);
    const changed = structuredClone(manifest); changed.columns.reverse();
    await expect(verifyManifest(changed, keys, changed.listing_id, at)).rejects.toThrow('column_mismatch');
  });
  for (const v of signing.signatures) it(`F2 ${v.name}`, async () => {
    let actual: Uint8Array<ArrayBuffer>;
    if (v.name.startsWith('proof-')) actual = proofBytes(requests.approve.commitment, requests.approve.proofs[Number(v.name.slice(-1))]);
    else if (v.name === 'commitment') actual = commitmentBytes(requests.approve.commitment);
    else if (v.name === 'platform-envelope') actual = platformBytes(signing.platform_envelope);
    else if (v.name === 'checkpoint') actual = checkpointBytes(signing.checkpoint);
    else actual = disclosureBytes(requests[v.name].binding);
    expect(hex(actual)).toBe(v.signed_bytes_hex);
    expect(hex(await sha(actual))).toBe(v.signed_bytes_sha256);
    expect(await verifyEd25519(v.public_key, v.signature, actual)).toBe(true);
  });
  for (const v of differential.valid) it(`differential ${v.name}`, async () => {
    const actual = v.kind === 'disclosure' ? disclosureBytes(v.input as Binding) : v.kind === 'platform-envelope' ? platformBytes(v.input as PlatformEnvelope) : jcs(v.input);
    expect(hex(actual)).toBe(v.signed_bytes_hex);
    expect(hex(await sha(actual))).toBe(v.signed_bytes_sha256);
    expect(await verifyEd25519(v.public_key, v.signature, actual)).toBe(true);
  });
  for (const v of differential.must_reject) it(`refuses ${v.name}`, () => expect(() => jcs(v.input)).toThrow());
  const supplemental = fixture('platform-valid-until-present.json');
  it('includes valid_until only when present', async () => {
    const actual = platformBytes(supplemental.input);
    expect(hex(actual)).toBe(supplemental.signed_bytes_hex); expect(hex(await sha(actual))).toBe(supplemental.signed_bytes_sha256);
    expect(await verifyEd25519(supplemental.public_key, supplemental.signature, actual)).toBe(true);
  });
  it('canonicalizes every complete package row and verifies all dataset digests', async () => {
    const pack = fixture('aim_preview_package_v2.json');
    expect(b64(await sha(utf8('aim-schema-v1\0'), jcs(base.canonical_schema)))).toBe(base.schema_digest);
    for (let i = 0; i < base.rows.length; i++) {
      const r = base.rows[i]; const row = canonicalRow(pack.entries[i].row, base.canonical_schema as Descriptor[]);
      expect(row.text).toBe(canonical(r.canonical_row));
      expect(b64(await sha(utf8('aim-row-v1\0'), unb64(base.schema_digest, 32), utf8('\0'), utf8(row.text)))).toBe(r.base_row_digest);
      const hash = await leaf(r.base_row_digest, r.duplicate_ordinal); expect(b64(hash)).toBe(r.leaf_hash);
      expect(await inclusion(hash, r.leaf_index, base.leaf_count, r.proof, base.dataset_merkle_root)).toBe(true);
    }
    expect(await sampleHash(pack.entries)).toBe(pack.sample_hash);
  });
  it('preserves historical log leaves, roots and fractional checkpoint bytes', async () => {
    const hashes = [];
    for (const entry of base.log.entries) {
      const value = {...entry}; delete value.canonical_entry_b64url; delete value.leaf_hash;
      expect(b64(jcs(value))).toBe(entry.canonical_entry_b64url);
      const hash = await sha(utf8('\0aim-log-leaf-v1\0'), jcs(value)); expect(b64(hash)).toBe(entry.leaf_hash); hashes.push(hash);
    }
    expect(b64(await node(hashes[0], hashes[1]))).toBe(base.log.root);
    for (const v of [base.log.checkpoint, ...base.log.fractional_checkpoint_vectors]) {
      const c: Checkpoint = {log_id: base.log.checkpoint.log_id, tree_size: 2, root_hash: base.log.root, checkpoint_at: v.checkpoint_at, key_id: base.log.checkpoint.key_id, public_key_algorithm: 'ed25519', signature: v.signature};
      expect(b64(checkpointBytes(c))).toBe(v.message_b64url);
      expect(await verifyEd25519(base.log.checkpoint.public_key, v.signature, checkpointBytes(c))).toBe(true);
    }
  });
  it('matches cross-format logical rows and integral-decimal digests', async () => {
    for (const name of ['aim_dataset_parser_v1.json', 'aim_dataset_integral_decimal_v1.json']) {
      const v = fixture(name), schema = schemaDescriptors(v.schema);
      expect(b64(await sha(utf8('aim-schema-v1\0'), jcs(schema)))).toBe(v.schema_digest);
      const digests: Uint8Array[] = [];
      for (const text of v.canonical_rows) {
        const triples = JSON.parse(text); const row = Object.fromEntries(triples.filter((t: string[]) => t[1] !== 'missing').map((t: [string, string, unknown]) => [t[0], t[2]]));
        expect(canonicalRow(row, schema).text).toBe(text);
        digests.push(await sha(utf8('aim-row-v1\0'), unb64(v.schema_digest, 32), utf8('\0'), utf8(text)));
      }
      digests.sort((a, b) => Buffer.compare(a, b)); const leaves = await Promise.all(digests.map(d => leaf(b64(d), 0)));
      expect(b64(leaves.length === 1 ? leaves[0] : await node(leaves[0], leaves[1]))).toBe(v.root);
    }
    const extended = fixture('aim_dataset_merkle_v1_extended.json');
    for (const v of extended.must_accept) expect(canonical(v.metadata)).toBe(v.canonical);
    for (const v of extended.must_reject) expect(() => canonical(v.metadata)).toThrow(v.reason);
  });
  it('verifies platform before resolving seller keys and validates all seller signatures', async () => {
    await expect(verifySignatures(signing.platform_envelope, requests.approve.commitment, keys, at)).resolves.toBeUndefined();
    const bad = structuredClone(signing.platform_envelope); bad.signature = b64(new Uint8Array(64)); bad.signer_keys[0].status = 'revoked';
    await expect(verifySignatures(bad, requests.approve.commitment, keys, at)).rejects.toThrow('platform_signature_invalid');
  });
  it('verifies consecutive independently trusted checkpoints', async () => {
    const s = fixture('subsequent-checkpoints.json');
    const previous: TrustedCheckpoint = {log_id: s.checkpoint.log_id, tree_size: s.trusted_previous.tree_size, root_hash: s.trusted_previous.root_hash};
    await expect(verifyLog(s.log_evidence, s.checkpoint, s.commitment, keys, previous)).resolves.toBeUndefined();
    await expect(verifyLog({...s.log_evidence, consistency_path: []}, s.checkpoint, s.commitment, keys, previous)).rejects.toThrow();
    await expect(verifyLog({...s.log_evidence, previous_root: null, previous_tree_size: null}, s.checkpoint, s.commitment, keys, previous)).rejects.toThrow();
  });
});

describe('canonical parser and row admission', () => {
  it('uses the pinned strict fallback only for unsupported Ed25519', async () => {
    const v = signing.signatures[0], input = new Uint8Array(Buffer.from(v.signed_bytes_hex, 'hex'));
    const spy = vi.spyOn(crypto.subtle, 'importKey');
    try {
      spy.mockRejectedValue(Object.assign(new Error('unsupported'), {name: 'NotSupportedError'}));
      expect(await verifyEd25519(v.public_key, v.signature, input)).toBe(true);
      expect(await verifyEd25519(v.public_key, b64(new Uint8Array(64)), input)).toBe(false);
      spy.mockRejectedValue(new Error('unavailable'));
      expect(await verifyEd25519(v.public_key, v.signature, input)).toBe(false);
    } finally {spy.mockRestore();}
  });
  it('preserves nanosecond UTC offsets and nested exact decimals', () => {
    const schema = schemaDescriptors([['t', 'timestamp', false, {timestamp_precision: 9}], ['a', 'array', false, {element_type: {type: 'decimal', type_parameters: {precision: 30, scale: 4}}}]]);
    expect(canonicalRow({t: '2026-09-17T02:00:00.123456789+02:00', a: ['9007199254740993.0100', '-0.0000']}, schema).text).toBe('[["a","array",["9007199254740993.01","0"]],["t","timestamp","2026-09-17T00:00:00.123456789Z"]]');
  });
  it('rejects 63/64 sibling paths incompatible with admitted safe-integer trees', async () => {
    for (const count of [63, 64]) expect(await inclusion(new Uint8Array(32), 0, Number.MAX_SAFE_INTEGER, Array(count).fill({hash: b64(new Uint8Array(32)), direction: 'right'}), b64(new Uint8Array(32)))).toBe(false);
  });
  it.each(['{"a":1,"a":2}', '{"e\\u0301":1,"é":2}', '{"n":9007199254740993}', '{"n":1.5}', '[1,]', '{"a":1,}', 'true false'])('rejects malformed JSON %s', text => expect(() => parseJson(utf8(text), 1024)).toThrow());
  it('preserves integer-looking key ordering and exact large typed values', () => {
    expect(canonical({'2': 'b', '10': 'a'})).toBe('{"10":"a","2":"b"}');
    expect(canonicalRow({id: '9007199254740993'}, [['id', 'signed_integer', false, {}]]).text).toContain('9007199254740993');
  });
  it('distinguishes missing, null, empty string and normalizes nested types', () => {
    const schema = schemaDescriptors([['a', 'string', true, {}], ['b', 'string', true, {}], ['c', 'string', true, {}]]);
    expect(canonicalRow({b: null, c: ''}, schema).text).toBe('[["a","missing",null],["b","null",null],["c","string",""]]');
  });
  it('checks package content and sample hash without issuing a display handle', async () => {
    const p = fixture('aim_preview_package_v2.json');
    const m = {commitment: {commitment_id: p.commitment_id, schema_digest: base.schema_digest, dataset_merkle_root: base.dataset_merkle_root} as Commitment, disclosure_version: p.disclosure_version, sample_hash: p.sample_hash, schema_descriptors: base.canonical_schema, proofs: p.entries as Proof[], package: {url: '', media_type: '', byte_ceiling: 1048576}};
    expect(await verifyPackage(bytes('aim_preview_package_v2.json'), m)).toHaveLength(5);
    const changed = structuredClone(p); changed.entries[0].row.id = '5';
    await expect(verifyPackage(jcs(changed), m)).rejects.toThrow('row_digest_mismatch');
    const hash = {...p, sample_hash: '0'.repeat(64)};
    await expect(verifyPackage(jcs(hash), {...m, sample_hash: hash.sample_hash})).rejects.toThrow('sample_hash_mismatch');
  });
});
