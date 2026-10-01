// Public copy follows the served Terms version on the first server render.
export async function getPublicTermsVersion(): Promise<string | null> {
  const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return null;
  try {
    const response = await fetch(`${apiUrl.replace(/\/$/, '')}/api/v1/legal/terms/current`, { cache: 'no-store' });
    if (!response.ok) return null;
    const terms = await response.json();
    return ['1.0', '1.1', '1.2'].includes(terms?.terms_version) ? terms.terms_version : null;
  } catch {
    return null;
  }
}
