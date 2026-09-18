"""Observed mutations in disposable copies; never alters the working candidate."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
out = Path('/var/tmp/s1716-t-frontend-completion-evidence')
out.mkdir(exist_ok=True)
mutations = [
    ('skip-platform-envelope',
     'lib/listing-preview/verifier.ts',
     '  await verifyPlatformEnvelope(e, keys);',
     '  // MUTATION: trust seller keys before authenticating platform envelope.',
     'lib/listing-preview/verifier.test.ts', 'verifies platform before resolving seller keys'),
    ('render-before-policy-completes',
     'lib/listing-preview/verifier.ts',
     '  await options.scan(entries, options.signal, m.schema_descriptors);',
     '  void options.scan(entries, options.signal, m.schema_descriptors); // MUTATION: early display.',
     'components/listings/ListingSamplePreview.test.tsx', 'waits for verification and the final manifest before rendering any row'),
    ('drop-package-sample-hash',
     'lib/listing-preview/verifier.ts',
     "  check(await sampleHash(p.entries) === p.sample_hash, 'sample_hash_mismatch');",
     '  // MUTATION: omitted ordered package sample hash.',
     'lib/listing-preview/verifier.test.ts', 'checks package content and sample hash without issuing a display handle'),
    ('skip-deterministic-scan',
     'lib/listing-preview/verifier.ts',
     '  await options.scan(entries, options.signal, m.schema_descriptors);',
     '  // MUTATION: omit deterministic scan.',
     'lib/listing-preview/policy.test.ts', 'deterministic scan refuses any unsafe complete row before issuing a handle'),
    ('skip-attestation-check',
     'lib/listing-preview/verifier.ts',
     '  await verifyScanAttestation(m);',
     '  // MUTATION: omit attestation check.',
     'lib/listing-preview/policy.test.ts', 'attestation check refuses a signed but incorrectly bound scan digest'),
    ('skip-fetched-leaf-digest',
     'lib/listing-preview/verifier.ts',
     "  check(sampled === m.approval.platform_envelope.binding.sampled_leaf_list_digest, 'sampled_list_mismatch');",
     '  // MUTATION: omit recomputation from fetched verified rows.',
     'lib/listing-preview/policy.test.ts', 'hides all rows when a validly signed attestation digests a different fetched leaf set'),
    ('accept-unknown-policy-version',
     'lib/listing-preview/policy.ts',
     "  check((policy === PRODUCER_POLICY || policy === DETERMINISTIC_POLICY) && version === POLICY_VERSION, 'scan_policy_unknown');",
     "  check(policy === PRODUCER_POLICY || policy === DETERMINISTIC_POLICY, 'scan_policy_unknown'); // MUTATION: ignore version.",
     'lib/listing-preview/policy.test.ts', 'accepts only known policy/version'),
]
results = []
originals = {source: (root / source).read_text() for _, source, *_ in mutations}
for name, source, old, new, target, test_name in mutations:
    original = originals[source]
    assert original.count(old) == 1, name
    with tempfile.TemporaryDirectory(prefix='s1716-preview-mutation-') as directory:
        work = Path(directory)
        for folder in ('lib', 'components', 'tests', 'api', 'types'):
            shutil.copytree(root / folder, work / folder)
        for file in ('package.json', 'tsconfig.json', 'vitest.config.ts'):
            shutil.copy2(root / file, work / file)
        (work / 'node_modules').symlink_to(root / 'node_modules', target_is_directory=True)
        (work / source).write_text(original.replace(old, new))
        log = out / (name + '.txt')
        command = ['rtk', 'proxy', 'npm', 'test', '--', target, '-t', test_name, '--maxWorkers=1']
        with log.open('w') as stream:
            result = subprocess.run(command, cwd=work, stdout=stream, stderr=subprocess.STDOUT)
        body = log.read_text()
        # A collection/configuration error is not a killed mutation.
        observed_failure = result.returncode == 1 and 'AssertionError' in body and 'FAIL ' in body
        results.append(dict(name=name, command=command, exit_code=result.returncode,
                            observed_assertion_failure=observed_failure,
                            log_sha256=hashlib.sha256(log.read_bytes()).hexdigest()))
        print(name, observed_failure, flush=True)
(out / 'mutations.json').write_text(json.dumps(results, indent=2) + '\n')
for source, original in originals.items():
    assert (root / source).read_text() == original
raise SystemExit(0 if all(r['observed_assertion_failure'] for r in results) else 1)
