const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/** Decimal SI bytes, shared by all public listing size displays. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${value.toLocaleString('en-US', {maximumFractionDigits: 2})} ${units[unit]}`;
}
