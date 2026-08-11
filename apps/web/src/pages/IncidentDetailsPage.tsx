import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, getIncidentById } from '../api';
import type { IncidentAnalysisDto, IncidentDto } from '../types/incident';
import { formatDateTime } from '../utils/format-datetime';
import styles from './IncidentDetailsPage.module.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; incident: IncidentDto }
  | { status: 'not-found' }
  | { status: 'error'; message: string }
  | { status: 'missing-id' };

function metadataEntries(
  metadata: Record<string, string>,
): Array<[string, string]> {
  return Object.entries(metadata).sort(([a], [b]) => a.localeCompare(b));
}

function AnalysisSection({ analysis }: { analysis: IncidentAnalysisDto }) {
  return (
    <section className={styles.panel} aria-labelledby="ai-analysis-heading">
      <h2 id="ai-analysis-heading">AI Analysis</h2>
      <p className={styles.analysisNote}>
        AI analysis is an investigation aid and hypothesis. It is not a
        confirmed root cause.
      </p>

      {analysis.status === 'pending' ? (
        <p className={styles.analysisStatus}>
          Analysis status: pending. Enrichment is not ready yet.
        </p>
      ) : null}

      {analysis.status === 'failed' ? (
        <p className={styles.analysisStatus}>
          Analysis status: failed. No analysis fields were produced for this
          incident.
        </p>
      ) : null}

      {analysis.status === 'completed' ? (
        <>
          {analysis.summary !== undefined ? (
            <div className={styles.analysisBlock}>
              <h3>Summary</h3>
              <p>{analysis.summary}</p>
            </div>
          ) : null}

          {analysis.possibleCause !== undefined ? (
            <div className={styles.analysisBlock}>
              <h3>Possible cause</h3>
              <p>{analysis.possibleCause}</p>
            </div>
          ) : null}

          {analysis.recommendedActions !== undefined &&
          analysis.recommendedActions.length > 0 ? (
            <div className={styles.analysisBlock}>
              <h3>Recommended investigation</h3>
              <ol className={styles.actions}>
                {analysis.recommendedActions.map((action, index) => (
                  <li key={`${index}-${action}`}>{action}</li>
                ))}
              </ol>
            </div>
          ) : null}

          {analysis.analyzedAt !== undefined ? (
            <div className={styles.analysisBlock}>
              <h3>Analyzed at</h3>
              <p>
                <time dateTime={analysis.analyzedAt}>
                  {formatDateTime(analysis.analyzedAt)}
                </time>
              </p>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

export function IncidentDetailsPage() {
  const { incidentId } = useParams<{ incidentId: string }>();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (incidentId === undefined || incidentId.trim().length === 0) {
      setState({ status: 'missing-id' });
      return;
    }

    const controller = new AbortController();
    setState({ status: 'loading' });

    void (async () => {
      try {
        const incident = await getIncidentById(incidentId, controller.signal);
        setState({ status: 'ready', incident });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        if (error instanceof ApiError && error.status === 404) {
          setState({ status: 'not-found' });
          return;
        }
        const message =
          error instanceof ApiError
            ? error.message
            : 'Unable to load incident.';
        setState({ status: 'error', message });
      }
    })();

    return () => {
      controller.abort();
    };
  }, [incidentId]);

  const backLink = (
    <Link className={styles.backLink} to="/incidents">
      Back to incidents
    </Link>
  );

  if (state.status === 'missing-id') {
    return (
      <section aria-labelledby="incident-details-heading">
        {backLink}
        <h1 id="incident-details-heading">Incident details</h1>
        <p className={styles.errorMessage} role="alert">
          No incident selected.
        </p>
      </section>
    );
  }

  if (state.status === 'loading') {
    return (
      <section aria-labelledby="incident-details-heading">
        {backLink}
        <h1 id="incident-details-heading">Incident details</h1>
        <p className={styles.statusMessage} role="status">
          Loading incident…
        </p>
      </section>
    );
  }

  if (state.status === 'not-found') {
    return (
      <section aria-labelledby="incident-details-heading">
        {backLink}
        <h1 id="incident-details-heading">Incident not found</h1>
        <p className={styles.errorMessage} role="alert">
          No incident exists with ID <code>{incidentId}</code>.
        </p>
        <p>
          <Link to="/incidents">Return to the incidents list</Link>
        </p>
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section aria-labelledby="incident-details-heading">
        {backLink}
        <h1 id="incident-details-heading">Incident details</h1>
        <p className={styles.errorMessage} role="alert">
          {state.message}
        </p>
      </section>
    );
  }

  const { incident } = state;
  const entries = metadataEntries(incident.metadata);

  return (
    <article aria-labelledby="incident-details-heading">
      {backLink}

      <header className={styles.header}>
        <h1 id="incident-details-heading">{incident.title}</h1>
        <p className={styles.metaLine}>
          <span className={styles.capitalize}>{incident.severity}</span>
          <span className={styles.separator} aria-hidden="true">
            •
          </span>
          <span className={styles.capitalize}>{incident.status}</span>
          <span className={styles.separator} aria-hidden="true">
            •
          </span>
          <span className={styles.plain}>{incident.source}</span>
          <span className={styles.separator} aria-hidden="true">
            •
          </span>
          <time dateTime={incident.createdAt}>
            {formatDateTime(incident.createdAt)}
          </time>
        </p>
      </header>

      <section className={styles.panel} aria-labelledby="overview-heading">
        <h2 id="overview-heading">Overview</h2>
        <dl className={styles.dl}>
          <dt>Service</dt>
          <dd>{incident.source}</dd>
          <dt>Error type</dt>
          <dd>{incident.errorType}</dd>
          <dt>Created</dt>
          <dd>
            <time dateTime={incident.createdAt}>
              {formatDateTime(incident.createdAt)}
            </time>
          </dd>
          <dt>Updated</dt>
          <dd>
            <time dateTime={incident.updatedAt}>
              {formatDateTime(incident.updatedAt)}
            </time>
          </dd>
          {incident.requestId !== undefined ? (
            <>
              <dt>Request ID</dt>
              <dd>{incident.requestId}</dd>
            </>
          ) : null}
        </dl>
      </section>

      {incident.description !== undefined &&
      incident.description.trim().length > 0 ? (
        <section className={styles.panel} aria-labelledby="description-heading">
          <h2 id="description-heading">Description</h2>
          <p className={styles.description}>{incident.description}</p>
        </section>
      ) : null}

      {entries.length > 0 ? (
        <section className={styles.panel} aria-labelledby="metadata-heading">
          <h2 id="metadata-heading">Metadata</h2>
          <dl className={styles.dl}>
            {entries.map(([key, value]) => (
              <div key={key} className={styles.metaPair}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {incident.analysis !== undefined ? (
        <AnalysisSection analysis={incident.analysis} />
      ) : null}
    </article>
  );
}
