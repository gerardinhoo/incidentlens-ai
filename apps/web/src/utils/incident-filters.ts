import { getAnalysisIndicatorState } from '../components/AnalysisBadge';
import type {
  IncidentDto,
  IncidentSeverity,
  IncidentStatus,
} from '../types/incident';

export const INCIDENT_LIST_PARAM = {
  status: 'status',
  severity: 'severity',
  analysis: 'analysis',
  service: 'service',
  q: 'q',
  mine: 'mine',
} as const;

const STATUSES = ['open', 'investigating', 'resolved'] as const;
const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
const ANALYSIS_FILTERS = ['completed', 'pending', 'failed', 'none'] as const;

export type IncidentAnalysisFilter = (typeof ANALYSIS_FILTERS)[number];

export type IncidentListFilters = {
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  analysis?: IncidentAnalysisFilter;
  service?: string;
  q?: string;
  mine?: true;
};

function isStatus(value: string): value is IncidentStatus {
  return (STATUSES as readonly string[]).includes(value);
}

function isSeverity(value: string): value is IncidentSeverity {
  return (SEVERITIES as readonly string[]).includes(value);
}

function isAnalysisFilter(value: string): value is IncidentAnalysisFilter {
  return (ANALYSIS_FILTERS as readonly string[]).includes(value);
}

/** Read list filters from the current URL. Unknown values are ignored. */
export function parseIncidentListFilters(
  params: URLSearchParams,
): IncidentListFilters {
  const statusRaw = params.get(INCIDENT_LIST_PARAM.status);
  const severityRaw = params.get(INCIDENT_LIST_PARAM.severity);
  const analysisRaw = params.get(INCIDENT_LIST_PARAM.analysis);
  const serviceRaw = params.get(INCIDENT_LIST_PARAM.service);
  const qRaw = params.get(INCIDENT_LIST_PARAM.q);
  const mineRaw = params.get(INCIDENT_LIST_PARAM.mine);

  const filters: IncidentListFilters = {};

  if (statusRaw !== null && isStatus(statusRaw)) {
    filters.status = statusRaw;
  }
  if (severityRaw !== null && isSeverity(severityRaw)) {
    filters.severity = severityRaw;
  }
  if (analysisRaw !== null && isAnalysisFilter(analysisRaw)) {
    filters.analysis = analysisRaw;
  }
  if (serviceRaw !== null && serviceRaw.trim().length > 0) {
    filters.service = serviceRaw.trim();
  }
  if (qRaw !== null && qRaw.trim().length > 0) {
    filters.q = qRaw.trim();
  }
  if (mineRaw === '1' || mineRaw === 'true') {
    filters.mine = true;
  }

  return filters;
}

export function incidentListFiltersAreActive(
  filters: IncidentListFilters,
): boolean {
  return (
    filters.status !== undefined ||
    filters.severity !== undefined ||
    filters.analysis !== undefined ||
    filters.service !== undefined ||
    filters.q !== undefined ||
    filters.mine === true
  );
}

export function uniqueIncidentServices(
  incidents: readonly IncidentDto[],
): string[] {
  return [...new Set(incidents.map((incident) => incident.source))].sort(
    (a, b) => a.localeCompare(b),
  );
}

function matchesSearch(incident: IncidentDto, q: string): boolean {
  const needle = q.toLowerCase();
  return (
    incident.title.toLowerCase().includes(needle) ||
    incident.id.toLowerCase().includes(needle)
  );
}

/** Client-side AND of URL filters against the fetched list. */
export function applyIncidentListFilters(
  incidents: readonly IncidentDto[],
  filters: IncidentListFilters,
  currentUserId?: string,
): IncidentDto[] {
  return incidents.filter((incident) => {
    if (filters.status !== undefined && incident.status !== filters.status) {
      return false;
    }
    if (
      filters.severity !== undefined &&
      incident.severity !== filters.severity
    ) {
      return false;
    }
    if (filters.analysis !== undefined) {
      const state = getAnalysisIndicatorState(incident.analysis);
      if (state !== filters.analysis) {
        return false;
      }
    }
    if (filters.service !== undefined && incident.source !== filters.service) {
      return false;
    }
    if (filters.q !== undefined && !matchesSearch(incident, filters.q)) {
      return false;
    }
    if (filters.mine === true) {
      if (
        currentUserId === undefined ||
        currentUserId.length === 0 ||
        incident.assigneeId !== currentUserId
      ) {
        return false;
      }
    }
    return true;
  });
}
