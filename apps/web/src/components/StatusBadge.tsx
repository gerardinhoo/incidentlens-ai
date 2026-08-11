import type { IncidentStatus } from '../types/incident';
import styles from './StatusBadge.module.css';

const STATUS_LABELS = {
  open: 'Open',
  investigating: 'Investigating',
  resolved: 'Resolved',
} as const satisfies Record<IncidentStatus, string>;

function statusClassName(status: IncidentStatus): string {
  switch (status) {
    case 'open':
      return styles.open ?? '';
    case 'investigating':
      return styles.investigating ?? '';
    case 'resolved':
      return styles.resolved ?? '';
  }
}

export interface StatusBadgeProps {
  status: IncidentStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`${styles.badge} ${statusClassName(status)}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
