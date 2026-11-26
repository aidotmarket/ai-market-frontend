import { permanentRedirect } from 'next/navigation';

export type MarketplaceSearchParams = Record<string, string | string[] | undefined>;

export function redirectLegacyModelSearch(path: string, { type, ...filters }: MarketplaceSearchParams) {
  if (type !== 'models' && !(Array.isArray(type) && type.includes('models'))) return;

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value)) {
      for (const entry of value) query.append(key, entry);
    } else if (value !== undefined) {
      query.set(key, value);
    }
  }

  const search = query.toString();
  permanentRedirect(search ? `${path}?${search}` : path);
}
