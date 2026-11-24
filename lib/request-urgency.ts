import type { DataRequestUrgency } from '@/types';

const labels: Record<DataRequestUrgency, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

export function requestUrgencyLabel(urgency: DataRequestUrgency): string {
  return Object.hasOwn(labels, urgency) ? labels[urgency] : 'Unspecified';
}
