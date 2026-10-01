export function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(price);
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function privacyScoreColor(score: number): string {
  if (score >= 8) return 'bg-green-100 text-green-800';
  if (score >= 5) return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-100 text-red-800';
}

// The listing header renders on the server and version cards in the browser.
// Use UTC explicitly so the same timestamp has the same publication date.
export function formatPublishedDate(dateStr:string):string {
  return new Date(dateStr).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'});
}
