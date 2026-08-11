import type { IncidentSeverity } from '../types/incident';
import styles from './SeverityBadge.module.css';

const SEVERITY_LABELS = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
} as const satisfies Record<IncidentSeverity, string>;

function severityClassName(severity: IncidentSeverity): string {
  switch (severity) {
    case 'low':
      return styles.low ?? '';
    case 'medium':
      return styles.medium ?? '';
    case 'high':
      return styles.high ?? '';
    case 'critical':
      return styles.critical ?? '';
  }
}

export interface SeverityBadgeProps {
  severity: IncidentSeverity;
}

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  return (
    <span className={`${styles.badge} ${severityClassName(severity)}`}>
      {SEVERITY_LABELS[severity]}
    </span>
  );
}
