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

export function trustLevelLabel(level: string): string {
  switch (level) {
    case 'L3': return 'Certified';
    case 'L2': return 'Reputable';
    case 'L1': return 'Verified';
    default: return 'New';
  }
}

export function verificationBadgeColor(status: string): string {
  switch (status) {
    case 'premium': return 'bg-purple-100 text-purple-800';
    case 'verified': return 'bg-blue-100 text-blue-800';
    default: return 'bg-gray-100 text-gray-600';
  }
}
