import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getIncidentById, isNotFoundError } from '../api';
import { IncidentStatusControls } from '../components/IncidentStatusControls';
import { ErrorState, LoadingState } from '../components/PageState';
import { SeverityBadge } from '../components/SeverityBadge';
import { StatusBadge } from '../components/StatusBadge';
import type { IncidentAnalysisDto, IncidentDto } from '../types/incident';
import { formatDateTime } from '../utils/format-datetime';
import styles from './IncidentDetailsPage.module.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; incident: IncidentDto }
  | { status: 'not-found' }
  | { status: 'error' }
  | { status: 'missing-id' };

function metadataEntries(
  metadata: Record<string, string>,
): Array<[string, string]> {
  return Object.entries(metadata).sort(([a], [b]) => a.localeCompare(b));
}

function AnalysisSection({ analysis }: { analysis: IncidentAnalysisDto }) {
  return (
    <section
      className={`${styles.panel} ${styles.analysisPanel}`}
      aria-labelledby="ai-analysis-heading"
    >
      <div className={styles.analysisHeader}>
        <h2 id="ai-analysis-heading">AI Analysis</h2>
      </div>

      {analysis.status === 'pending' ? (
        <p className={styles.analysisStatus}>Analysis is being prepared.</p>
      ) : null}

      {analysis.status === 'failed' ? (
        <p className={styles.analysisStatus}>
          Analysis is unavailable for this incident.
        </p>
      ) : null}

      {analysis.status === 'completed' ? (
        <>
          <p className={styles.analysisNote}>
            AI-assisted hypothesis. Verify findings before remediation.
          </p>

          {analysis.summary !== undefined ? (
            <div className={styles.analysisBlock}>
              <h3>Summary</h3>
              <p>{analysis.summary}</p>
            </div>
          ) : null}

          {analysis.possibleCause !== undefined ? (
            <div className={styles.analysisBlock}>
              <h3>Possible Cause</h3>
              <p>{analysis.possibleCause}</p>
            </div>
          ) : null}

          {analysis.recommendedActions !== undefined &&
          analysis.recommendedActions.length > 0 ? (
            <div className={styles.analysisBlock}>
              <h3>Recommended Investigation</h3>
              <ol className={styles.actions}>
                {analysis.recommendedActions.map((action, index) => (
                  <li key={`${index}-${action}`}>{action}</li>
                ))}
              </ol>
            </div>
          ) : null}

          {analysis.analyzedAt !== undefined ? (
            <p className={styles.analyzedAt}>
              Analyzed{' '}
              <time dateTime={analysis.analyzedAt}>
                {formatDateTime(analysis.analyzedAt)}
              </time>
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

export function IncidentDetailsPage() {
  const { incidentId } = useParams<{ incidentId: string }>();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);

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
        if (!controller.signal.aborted) {
          setState({ status: 'ready', incident });
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        if (controller.signal.aborted) {
          return;
        }
        if (isNotFoundError(error)) {
          setState({ status: 'not-found' });
          return;
        }
        setState({ status: 'error' });
      }
    })();

    return () => {
      controller.abort();
    };
  }, [incidentId, reloadToken]);

  const backLink = (
    <Link className={styles.backLink} to="/incidents">
      Back to incidents
    </Link>
  );

  if (state.status === 'missing-id') {
    return (
      <section aria-labelledby="incident-details-heading">
        <ErrorState
          title="Incident not found"
          description="No incident was selected. Choose an incident from the list."
          backToIncidents
        />
      </section>
    );
  }

  if (state.status === 'loading') {
    return (
      <section aria-labelledby="incident-details-heading">
        {backLink}
        <h1 id="incident-details-heading">Incident details</h1>
        <LoadingState message="Loading incident…" />
      </section>
    );
  }

  if (state.status === 'not-found') {
    return (
      <section aria-labelledby="incident-details-heading">
        <ErrorState
          title="Incident not found"
          description="The incident may have been removed or the link may be invalid."
          backToIncidents
        />
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section aria-labelledby="incident-details-heading">
        <ErrorState
          title="Unable to load incident"
          description="We couldn't retrieve this incident from the IncidentLens API."
          onRetry={() => {
            setReloadToken((token) => token + 1);
          }}
          backToIncidents
        />
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
        <div className={styles.metaLine}>
          <SeverityBadge severity={incident.severity} />
          <StatusBadge status={incident.status} />
          <span className={styles.metaSecondary}>
            <span className={styles.service}>{incident.source}</span>
            <span className={styles.dot} aria-hidden="true">
              ·
            </span>
            <time dateTime={incident.createdAt}>
              {formatDateTime(incident.createdAt)}
            </time>
          </span>
        </div>
      </header>

      <IncidentStatusControls
        incident={incident}
        onUpdated={(updated) => {
          setState({ status: 'ready', incident: updated });
        }}
      />

      <section className={styles.panel} aria-labelledby="overview-heading">
        <h2 id="overview-heading">Overview</h2>
        <dl className={styles.dl}>
          <dt>Service</dt>
          <dd className={styles.mono}>{incident.source}</dd>
          <dt>Error Type</dt>
          <dd className={styles.mono}>{incident.errorType}</dd>
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
              <dd className={styles.mono}>{incident.requestId}</dd>
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
                <dd className={styles.mono}>{value}</dd>
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
