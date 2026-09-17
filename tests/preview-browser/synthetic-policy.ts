/** Test harness only. Never imported by the Next application or a production
 * build. The real detector-unavailable boundary is covered separately. */
export async function scanLocalPreview(): Promise<void> {
  const test = window as unknown as {releaseSyntheticScan?: Promise<void>};
  if (test.releaseSyntheticScan) await test.releaseSyntheticScan;
}
