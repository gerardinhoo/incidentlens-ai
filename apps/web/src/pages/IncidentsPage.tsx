import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getIncidents } from '../api';
import { EmptyState, ErrorState, LoadingState } from '../components/PageState';
import { SeverityBadge } from '../components/SeverityBadge';
import { StatusBadge } from '../components/StatusBadge';
import type { IncidentDto } from '../types/incident';
import { formatDateTime } from '../utils/format-datetime';
import styles from './IncidentsPage.module.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; incidents: IncidentDto[] }
  | { status: 'error' };

export function IncidentsPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);

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

  return (
    <section aria-labelledby="incidents-heading">
      <div className={styles.header}>
        <h1 id="incidents-heading">Incidents</h1>
        <p>Recent incidents from the IncidentLens API.</p>
      </div>

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

      {state.status === 'ready' && state.incidents.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Incident</th>
                <th scope="col">Service</th>
                <th scope="col">Severity</th>
                <th scope="col">Status</th>
                <th scope="col">Created</th>
              </tr>
            </thead>
            <tbody>
              {state.incidents.map((incident) => (
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
                  <td className={styles.created} data-label="Created">
                    <time dateTime={incident.createdAt}>
                      {formatDateTime(incident.createdAt)}
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
