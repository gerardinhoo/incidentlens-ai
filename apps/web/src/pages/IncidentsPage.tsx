import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getIncidents } from '../api';
import { AnalysisBadge } from '../components/AnalysisBadge';
import { EmptyState, ErrorState, LoadingState } from '../components/PageState';
import { SeverityBadge } from '../components/SeverityBadge';
import { StatusBadge } from '../components/StatusBadge';
import type { IncidentDto } from '../types/incident';
import { formatDateTime, formatRelativeTime } from '../utils/format-datetime';
import {
  applyIncidentListFilters,
  INCIDENT_LIST_PARAM,
  incidentListFiltersAreActive,
  parseIncidentListFilters,
  uniqueIncidentServices,
  type IncidentListFilters,
} from '../utils/incident-filters';
import { computeIncidentMetrics } from '../utils/incident-metrics';
import {
  INCIDENT_LIST_SORT_PARAM,
  parseIncidentListSort,
  sortIncidentList,
  type IncidentListSort,
} from '../utils/incident-sort';
import styles from './IncidentsPage.module.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; incidents: IncidentDto[] }
  | { status: 'error' };

function writeFilters(
  current: URLSearchParams,
  next: IncidentListFilters,
): URLSearchParams {
  const params = new URLSearchParams(current);
  const keys = [
    INCIDENT_LIST_PARAM.status,
    INCIDENT_LIST_PARAM.severity,
    INCIDENT_LIST_PARAM.analysis,
    INCIDENT_LIST_PARAM.service,
    INCIDENT_LIST_PARAM.q,
  ] as const;
  for (const key of keys) {
    params.delete(key);
  }
  if (next.status !== undefined) {
    params.set(INCIDENT_LIST_PARAM.status, next.status);
  }
  if (next.severity !== undefined) {
    params.set(INCIDENT_LIST_PARAM.severity, next.severity);
  }
  if (next.analysis !== undefined) {
    params.set(INCIDENT_LIST_PARAM.analysis, next.analysis);
  }
  if (next.service !== undefined) {
    params.set(INCIDENT_LIST_PARAM.service, next.service);
  }
  if (next.q !== undefined) {
    params.set(INCIDENT_LIST_PARAM.q, next.q);
  }
  return params;
}

export function IncidentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);

  const filters = parseIncidentListFilters(searchParams);
  const sort = parseIncidentListSort(searchParams);
  const filtersActive = incidentListFiltersAreActive(filters);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });

    void (async () => {
      try {
        const incidents = await getIncidents(controller.signal);
        if (!controller.signal.aborted) {
          setState({ status: 'ready', incidents });
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        if (!controller.signal.aborted) {
          setState({ status: 'error' });
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [reloadToken]);

  const metrics =
    state.status === 'ready'
      ? computeIncidentMetrics(state.incidents)
      : undefined;

  const visibleIncidents = useMemo(() => {
    if (state.status !== 'ready') {
      return [];
    }
    return sortIncidentList(
      applyIncidentListFilters(state.incidents, filters),
      sort,
    );
  }, [filters, sort, state]);

  const services =
    state.status === 'ready' ? uniqueIncidentServices(state.incidents) : [];

  function patchFilters(
    patch:
      | 'clear'
      | {
          [K in keyof IncidentListFilters]?: IncidentListFilters[K] | undefined;
        },
  ) {
    if (patch === 'clear') {
      setSearchParams(writeFilters(searchParams, {}), { replace: true });
      return;
    }
    const next: IncidentListFilters = { ...filters };
    for (const [key, value] of Object.entries(patch) as Array<
      [keyof IncidentListFilters, string | undefined]
    >) {
      if (value === undefined || value === '') {
        delete next[key];
      } else {
        next[key] = value as never;
      }
    }
    setSearchParams(writeFilters(searchParams, next), { replace: true });
  }

  function patchSort(nextSort: IncidentListSort) {
    const params = new URLSearchParams(searchParams);
    if (nextSort === 'created') {
      params.delete(INCIDENT_LIST_SORT_PARAM);
    } else {
      params.set(INCIDENT_LIST_SORT_PARAM, nextSort);
    }
    setSearchParams(params, { replace: true });
  }

  return (
    <section aria-labelledby="incidents-heading">
      <div className={styles.header}>
        <h1 id="incidents-heading">Incidents</h1>
        <p>AI-assisted incident investigation</p>
      </div>

      {metrics !== undefined ? (
        <ul className={styles.metrics} aria-label="Incident summary">
          <li>
            <button
              type="button"
              className={styles.metric}
              aria-pressed={!filtersActive}
              onClick={() => {
                patchFilters('clear');
              }}
            >
              <span className={styles.metricValue}>{metrics.total}</span>
              <span className={styles.metricLabel}>Total</span>
            </button>
          </li>
          <li>
            <button
              type="button"
              className={styles.metric}
              aria-pressed={filters.severity === 'critical'}
              onClick={() => {
                patchFilters({
                  severity:
                    filters.severity === 'critical' ? undefined : 'critical',
                });
              }}
            >
              <span className={styles.metricValue}>{metrics.critical}</span>
              <span className={styles.metricLabel}>Critical</span>
            </button>
          </li>
          <li>
            <button
              type="button"
              className={styles.metric}
              aria-pressed={filters.severity === 'high'}
              onClick={() => {
                patchFilters({
                  severity: filters.severity === 'high' ? undefined : 'high',
                });
              }}
            >
              <span className={styles.metricValue}>{metrics.high}</span>
              <span className={styles.metricLabel}>High</span>
            </button>
          </li>
          <li>
            <button
              type="button"
              className={styles.metric}
              aria-pressed={filters.status === 'open'}
              onClick={() => {
                patchFilters({
                  status: filters.status === 'open' ? undefined : 'open',
                });
              }}
            >
              <span className={styles.metricValue}>{metrics.open}</span>
              <span className={styles.metricLabel}>Open</span>
            </button>
          </li>
        </ul>
      ) : null}

      {state.status === 'ready' && state.incidents.length > 0 ? (
        <form
          className={styles.filters}
          aria-label="Filter incidents"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Search</span>
            <input
              className={styles.filterInput}
              type="search"
              name="q"
              placeholder="Title or id"
              value={searchParams.get(INCIDENT_LIST_PARAM.q) ?? ''}
              onChange={(event) => {
                const value = event.target.value;
                patchFilters({
                  q: value.length > 0 ? value : undefined,
                });
              }}
            />
          </label>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Status</span>
            <select
              className={styles.filterInput}
              name="status"
              value={filters.status ?? ''}
              onChange={(event) => {
                patchFilters({
                  status:
                    event.target.value === ''
                      ? undefined
                      : (event.target.value as IncidentListFilters['status']),
                });
              }}
            >
              <option value="">All</option>
              <option value="open">Open</option>
              <option value="investigating">Investigating</option>
              <option value="resolved">Resolved</option>
            </select>
          </label>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Severity</span>
            <select
              className={styles.filterInput}
              name="severity"
              value={filters.severity ?? ''}
              onChange={(event) => {
                patchFilters({
                  severity:
                    event.target.value === ''
                      ? undefined
                      : (event.target.value as IncidentListFilters['severity']),
                });
              }}
            >
              <option value="">All</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Analysis</span>
            <select
              className={styles.filterInput}
              name="analysis"
              value={filters.analysis ?? ''}
              onChange={(event) => {
                patchFilters({
                  analysis:
                    event.target.value === ''
                      ? undefined
                      : (event.target.value as IncidentListFilters['analysis']),
                });
              }}
            >
              <option value="">All</option>
              <option value="completed">AI analyzed</option>
              <option value="pending">Analyzing</option>
              <option value="failed">Failed</option>
              <option value="none">Not analyzed</option>
            </select>
          </label>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Service</span>
            <select
              className={styles.filterInput}
              name="service"
              value={filters.service ?? ''}
              onChange={(event) => {
                patchFilters({
                  service:
                    event.target.value === '' ? undefined : event.target.value,
                });
              }}
            >
              <option value="">All</option>
              {services.map((service) => (
                <option key={service} value={service}>
                  {service}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Sort</span>
            <select
              className={styles.filterInput}
              name="sort"
              value={sort}
              onChange={(event) => {
                patchSort(
                  event.target.value === 'severity' ? 'severity' : 'created',
                );
              }}
            >
              <option value="created">Newest</option>
              <option value="severity">Severity</option>
            </select>
          </label>
          {filtersActive ? (
            <button
              type="button"
              className={styles.clearFilters}
              onClick={() => {
                patchFilters('clear');
              }}
            >
              Clear filters
            </button>
          ) : null}
        </form>
      ) : null}

      {state.status === 'loading' ? (
        <LoadingState message="Loading incidents…" />
      ) : null}

      {state.status === 'error' ? (
        <ErrorState
          title="Unable to load incidents"
          description="We couldn't retrieve incidents from the IncidentLens API."
          onRetry={() => {
            setReloadToken((token) => token + 1);
          }}
        />
      ) : null}

      {state.status === 'ready' && state.incidents.length === 0 ? (
        <EmptyState
          title="No incidents detected"
          description="IncidentLens hasn't received any incidents yet."
        />
      ) : null}

      {state.status === 'ready' &&
      state.incidents.length > 0 &&
      visibleIncidents.length === 0 ? (
        <EmptyState
          title="No incidents match"
          description="Nothing in the queue matches these filters."
          action={
            <button
              type="button"
              className={styles.clearFilters}
              onClick={() => {
                patchFilters('clear');
              }}
            >
              Clear filters
            </button>
          }
        />
      ) : null}

      {state.status === 'ready' && visibleIncidents.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Incident</th>
                <th scope="col">Service</th>
                <th scope="col">Severity</th>
                <th scope="col">Status</th>
                <th scope="col">Analysis</th>
                <th scope="col">Created</th>
              </tr>
            </thead>
            <tbody>
              {visibleIncidents.map((incident) => (
                <tr key={incident.id}>
                  <td data-label="Incident">
                    <Link
                      className={styles.titleLink}
                      to={`/incidents/${incident.id}`}
                    >
                      {incident.title}
                    </Link>
                  </td>
                  <td className={styles.service} data-label="Service">
                    {incident.source}
                  </td>
                  <td className={styles.severity} data-label="Severity">
                    <SeverityBadge severity={incident.severity} />
                  </td>
                  <td className={styles.status} data-label="Status">
                    <StatusBadge status={incident.status} />
                  </td>
                  <td className={styles.analysis} data-label="Analysis">
                    <AnalysisBadge analysis={incident.analysis} />
                  </td>
                  <td className={styles.created} data-label="Created">
                    <time
                      dateTime={incident.createdAt}
                      title={formatDateTime(incident.createdAt)}
                    >
                      {formatRelativeTime(incident.createdAt)}
                    </time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
