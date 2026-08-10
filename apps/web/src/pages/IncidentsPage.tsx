import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, getIncidents } from '../api';
import type { IncidentDto } from '../types/incident';
import { formatDateTime } from '../utils/format-datetime';
import styles from './IncidentsPage.module.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; incidents: IncidentDto[] }
  | { status: 'error'; message: string };

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return '';
  }
  return 'Unable to load incidents.';
}

export function IncidentsPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const incidents = await getIncidents(controller.signal);
        setState({ status: 'ready', incidents });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        setState({ status: 'error', message: errorMessage(error) });
      }
    })();

    return () => {
      controller.abort();
    };
  }, []);

  return (
    <section aria-labelledby="incidents-heading">
      <div className={styles.header}>
        <h1 id="incidents-heading">Incidents</h1>
        <p>Recent incidents from the IncidentLens API.</p>
      </div>

      {state.status === 'loading' ? (
        <p className={styles.statusMessage} role="status">
          Loading incidents…
        </p>
      ) : null}

      {state.status === 'error' ? (
        <p className={styles.errorMessage} role="alert">
          {state.message}
        </p>
      ) : null}

      {state.status === 'ready' && state.incidents.length === 0 ? (
        <p className={styles.statusMessage}>No incidents found.</p>
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
                    {incident.severity}
                  </td>
                  <td className={styles.status} data-label="Status">
                    {incident.status}
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
