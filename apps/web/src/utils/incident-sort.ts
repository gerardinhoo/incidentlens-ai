import type { IncidentDto, IncidentSeverity } from '../types/incident';

export const INCIDENT_LIST_SORT_PARAM = 'sort';

export const INCIDENT_LIST_SORTS = ['created', 'severity'] as const;

export type IncidentListSort = (typeof INCIDENT_LIST_SORTS)[number];

const SEVERITY_RANK: Record<IncidentSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function createdAtMs(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
}

/** Default and shareable list sorts. Unknown `sort` values fall back to newest. */
export function parseIncidentListSort(
  params: URLSearchParams,
): IncidentListSort {
  return params.get(INCIDENT_LIST_SORT_PARAM) === 'severity'
    ? 'severity'
    : 'created';
}

/**
 * Newest-first by `createdAt`, or severity (critical → low) with recency as tie-break.
 */
export function sortIncidentList(
  incidents: readonly IncidentDto[],
  sort: IncidentListSort,
): IncidentDto[] {
  return [...incidents].sort((left, right) => {
    if (sort === 'severity') {
      const bySeverity =
        SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity];
      if (bySeverity !== 0) {
        return bySeverity;
      }
    }
    const byCreated =
      createdAtMs(right.createdAt) - createdAtMs(left.createdAt);
    if (byCreated !== 0) {
      return byCreated;
    }
    return left.id.localeCompare(right.id);
  });
}
