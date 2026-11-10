import {createHash} from 'node:crypto';
import {afterEach, expect, it, vi} from 'vitest';
import {hashDataSheet, PDF_LIMIT} from './listingDocumentPdf';

afterEach(() => vi.unstubAllGlobals());

it('checks and hashes a PDF entirely locally using SHA-256, preserving filename and byte size', async () => {
  const fetch = vi.fn(() => {throw new Error('No network permitted');});
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal('XMLHttpRequest', fetch);
  const bytes = '%PDF-1.7\nSynthetic PDF bytes 🫨';
  const file = new File([bytes], 'technical 🫨.pdf', {type: 'application/pdf'});
  expect(await hashDataSheet(file)).toEqual({pdf_filename: file.name, pdf_size_bytes: Buffer.byteLength(bytes), pdf_sha256: createHash('sha256').update(bytes).digest('hex')});
  expect(fetch).not.toHaveBeenCalled();
});

it.each(['', '<html>not a PDF', ' %PDF-', '%pdf-1.7'])('refuses a missing or invalid PDF header: %j', async value => {
  await expect(hashDataSheet(new File([value], 'fake.pdf', {type: 'application/pdf'}))).rejects.toThrow();
});

it('accepts exactly the size boundary and refuses larger files before reading them', async () => {
  const bytes = new Uint8Array(PDF_LIMIT); bytes.set(new TextEncoder().encode('%PDF-'));
  expect((await hashDataSheet(new File([bytes], 'limit.pdf'))).pdf_size_bytes).toBe(PDF_LIMIT);
  const large = new File([bytes, 'x'], 'large.pdf');
  const read = vi.spyOn(large, 'arrayBuffer');
  await expect(hashDataSheet(large)).rejects.toThrow('no larger than 10 MB');
  expect(read).not.toHaveBeenCalled();
});
