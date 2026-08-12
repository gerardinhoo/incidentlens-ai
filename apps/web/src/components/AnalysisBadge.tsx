import type { IncidentAnalysisDto } from '../types/incident';
import styles from './AnalysisBadge.module.css';

export type AnalysisIndicatorState =
  'completed' | 'pending' | 'failed' | 'none';

const ANALYSIS_LABELS = {
  completed: 'AI Analyzed',
  pending: 'Analyzing…',
  failed: 'Analysis failed',
  none: 'Not analyzed',
} as const satisfies Record<AnalysisIndicatorState, string>;

export function getAnalysisIndicatorState(
  analysis: IncidentAnalysisDto | undefined,
): AnalysisIndicatorState {
  if (analysis === undefined) {
    return 'none';
  }
  return analysis.status;
}

function analysisClassName(state: AnalysisIndicatorState): string {
  switch (state) {
    case 'completed':
      return styles.completed ?? '';
    case 'pending':
      return styles.pending ?? '';
    case 'failed':
      return styles.failed ?? '';
    case 'none':
      return styles.none ?? '';
  }
}

export interface AnalysisBadgeProps {
  analysis: IncidentAnalysisDto | undefined;
}

export function AnalysisBadge({ analysis }: AnalysisBadgeProps) {
  const state = getAnalysisIndicatorState(analysis);
  return (
    <span className={`${styles.badge} ${analysisClassName(state)}`}>
      {ANALYSIS_LABELS[state]}
    </span>
  );
}
