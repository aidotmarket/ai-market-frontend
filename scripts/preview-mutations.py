"""Observed mutations in disposable copies; never alters the working candidate."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
out = Path('/var/tmp/s1716-t-frontend-evidence')
out.mkdir(exist_ok=True)
mutations = [
    ('skip-platform-envelope',
     '  await verifyPlatformEnvelope(e, keys);',
     '  // MUTATION: trust seller keys before authenticating platform envelope.',
     'lib/listing-preview/verifier.test.ts', 'verifies platform before resolving seller keys'),
    ('render-before-policy-completes',
     '  await options.scan(entries, options.signal);',
     '  void options.scan(entries, options.signal); // MUTATION: early display.',
     'components/listings/ListingSamplePreview.test.tsx', 'waits for verification and the final manifest before rendering any row'),
    ('drop-package-sample-hash',
     "  check(await sampleHash(p.entries) === p.sample_hash, 'sample_hash_mismatch');",
     '  // MUTATION: omitted ordered package sample hash.',
     'lib/listing-preview/verifier.test.ts', 'checks package content and sample hash without issuing a display handle'),
]
results = []
original = (root / 'lib/listing-preview/verifier.ts').read_text()
for name, old, new, target, test_name in mutations:
    assert original.count(old) == 1, name
    with tempfile.TemporaryDirectory(prefix='s1716-preview-mutation-') as directory:
        work = Path(directory)
        for folder in ('lib', 'components', 'tests', 'api', 'types'):
            shutil.copytree(root / folder, work / folder)
        for file in ('package.json', 'tsconfig.json', 'vitest.config.ts'):
            shutil.copy2(root / file, work / file)
        (work / 'node_modules').symlink_to(root / 'node_modules', target_is_directory=True)
        (work / 'lib/listing-preview/verifier.ts').write_text(original.replace(old, new))
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
assert (root / 'lib/listing-preview/verifier.ts').read_text() == original
raise SystemExit(0 if all(r['observed_assertion_failure'] for r in results) else 1)
