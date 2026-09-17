"""Reproduce the cross-repo deterministic corpus against pinned producer source.
Uses only its deterministic check_text AST; never imports/executes ML services.
"""
import ast
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import unicodedata

producer = '/Users/max/Projects/ai-market/aim-data'
revision = '119f643b5fd25dc8fd61557649371c9832ca33c5'
source = subprocess.check_output(['rtk', 'proxy', 'git', 'show', revision + ':app/services/preview_content_policy.py'], cwd=producer)
tree = ast.parse(source)
names = {'RULES', 'COMPILED', 'TOKEN', 'PolicyError', 'check_text'}
nodes = [n for n in tree.body if getattr(n, 'name', None) in names or isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id in names for t in n.targets)]
scope = dict(re=re, math=math, Counter=Counter, unicodedata=unicodedata)
exec(compile(ast.Module(body=nodes, type_ignores=[]), '<pinned-producer-deterministic-policy>', 'exec'), scope)
# Credential-shaped synthetic inputs are stored as fragments, never credentials.
texts = [
 ('safe', 'barley'), ('empty', ''), ('unicode', 'café 山'), ('boolean-text', 'True'),
 ('numeric-negative', '-12.5', True), ('numeric-formula-looking', '-12.5'),
 ('at-formula', '@SUM(A1)'), ('equals-formula', '=1+1'), ('plus-formula', '  +1'),
 ('private-key', ['-----BEGIN RSA ', 'PRIVATE KEY-----']), ('aws', ['AKIA', 'ABCDEFGHIJKLMNOP']),
 ('github', 'ghp_example'), ('github-pat', 'github_pat_example'), ('stripe-live', 'sk_live_example'),
 ('stripe-test', 'sk_test_example'), ('openai', 'sk-proj-example'), ('slack', 'xoxb-example'),
 ('password', 'password=example'), ('api-key', 'api_key: example'), ('authorization', 'Authorization: example'),
 ('bearer', 'Bearer example'), ('jwt', 'eyJabc.abc.abc'), ('connection', 'postgresql://user:example@db.example/catalog'),
 ('email', 'test@example.com'), ('unicode-email', 'téšt@exämple.com'), ('ssn', '123-45-6789'),
 ('phone', '123 456 7890'), ('card', '4111111111111111'), ('iban', 'GB82WEST12345698765432'), ('ip', '192.0.2.1'),
 ('html', '<b>hello</b>'), ('script', '<script>alert(1)</script>'), ('event-handler', 'onload=example'),
 ('macro', 'Workbook_Open'), ('javascript', 'javascript:example'), ('data-uri', 'data:text/plain,abc'),
 ('url', 'https://example.com'), ('www', 'www.example.com'), ('protocol-relative', '//example.com'),
 ('markdown-url', '[label](example.com)'), ('mailto', 'mailto:test'), ('tel', 'tel:123'),
 ('copyright', 'copyright example'), ('licensed', 'licensed under MIT'), ('restriction', 'not for redistribution'),
 ('length-500', 'a'*500), ('length-501', 'a'*501), ('astral-500', '🌾'*500), ('astral-501', '🌾'*501),
 ('words-80', 'a '*79+'a'), ('words-81', 'a '*80+'a'), ('newline', 'a\nb'), ('zero-width', 'a\u200bb'),
 ('entropy-short', 'AbCdEfGhIjKlMnOpQrStUvW'), ('entropy-24', 'AbCdEfGhIjKlMnOpQrStUvWxY'),
 ('entropy-exact-4', 'ABCDEFGHIJKLMNOPABCDEFGHIJKLMNOP'), ('entropy-below-4', 'ABCDEFGHIJKLMNOABCDEFGHIJKLMNO'),
 ('low-entropy', 'a'*24), ('unicode-boundary', 'épassword=example'),
]
vectors = []
for item in texts:
 name, stored, *numeric = item
 text = ''.join(stored) if isinstance(stored, list) else stored
 value = dict(id=name, **({'text_parts': stored} if isinstance(stored, list) else {'text': stored}), numeric=bool(numeric and numeric[0]))
 try:
  scope['check_text'](text, value['numeric'])
  value['reason'] = None
 except scope['PolicyError'] as error:
  value['reason'] = str(error)
 vectors.append(value)
result = dict(profile='aim-preview-policy-v1-deterministic', version='1.0.0', producer_revision=revision,
 producer_path='app/services/preview_content_policy.py', producer_source_sha256=hashlib.sha256(source).hexdigest(), vectors=vectors)
path = Path('tests/fixtures/preview/aim-preview-policy-v1-deterministic-vectors.json')
encoded = (json.dumps(result, ensure_ascii=False, indent=2)+'\n').encode()
if '--write' in __import__('sys').argv:
 path.write_bytes(encoded)
 path.with_suffix('.sha256').write_text(hashlib.sha256(encoded).hexdigest()+'  '+path.name+'\n')
else:
 assert path.read_bytes() == encoded
 print(f'{len(vectors)} vectors match pinned producer; SHA256 {hashlib.sha256(encoded).hexdigest()}')
