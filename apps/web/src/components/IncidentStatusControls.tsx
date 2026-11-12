import { useState } from 'react';
import { isApiError, updateIncidentStatus } from '../api';
import type { IncidentDto, IncidentStatus } from '../types/incident';
import { formatDateTime } from '../utils/format-datetime';
import {
  getAllowedStatusTransitions,
  STATUS_TRANSITION_LABELS,
} from '../utils/status-transitions';
import { StatusBadge } from './StatusBadge';
import styles from './IncidentStatusControls.module.css';

export interface IncidentStatusControlsProps {
  incident: IncidentDto;
  currentUserId?: string;
  onUpdated: (incident: IncidentDto) => void;
}

function transitionLabel(status: IncidentStatus): string {
  if (status === 'investigating' || status === 'resolved') {
    return STATUS_TRANSITION_LABELS[status];
  }
  return status;
}

function actorLabel(
  actorId: string,
  actorEmail: string | undefined,
  currentUserId: string | undefined,
): string {
  if (currentUserId !== undefined && currentUserId === actorId) {
    return 'You';
  }
  if (actorEmail !== undefined && actorEmail.length > 0) {
    return actorEmail;
  }
  return 'Operator';
}

export function IncidentStatusControls({
  incident,
  currentUserId,
  onUpdated,
}: IncidentStatusControlsProps) {
  const [pendingStatus, setPendingStatus] = useState<IncidentStatus | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const allowed = getAllowedStatusTransitions(incident.status);
  const isUpdating = pendingStatus !== null;

  async function handleTransition(nextStatus: IncidentStatus) {
    if (isUpdating) {
      return;
    }

    setErrorMessage(null);
    setPendingStatus(nextStatus);

    try {
      const updated = await updateIncidentStatus(incident.id, nextStatus);
      onUpdated(updated);
    } catch (error) {
      if (isApiError(error)) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Unable to update status. Please try again.');
      }
    } finally {
      setPendingStatus(null);
    }
  }

  return (
    <section
      className={styles.panel}
      aria-labelledby="status-management-heading"
    >
      <h2 id="status-management-heading">Status</h2>

      <div className={styles.current}>
        <span className={styles.currentLabel}>Current status</span>
        <StatusBadge status={incident.status} />
      </div>

      {allowed.length === 0 ? (
        <p className={styles.resolvedNote}>This incident is resolved.</p>
      ) : (
        <div className={styles.actions} role="group" aria-label="Update status">
          {allowed.map((nextStatus) => (
            <button
              key={nextStatus}
              type="button"
              className={styles.actionButton}
              disabled={isUpdating}
              onClick={() => {
                void handleTransition(nextStatus);
              }}
            >
              {pendingStatus === nextStatus
                ? 'Updating…'
                : transitionLabel(nextStatus)}
            </button>
          ))}
        </div>
      )}

      {isUpdating ? (
        <p className={styles.updating} role="status">
          Updating status…
        </p>
      ) : null}

      {errorMessage !== null ? (
        <p className={styles.error} role="alert">
          {errorMessage}
        </p>
      ) : null}

      {incident.statusHistory !== undefined &&
      incident.statusHistory.length > 0 ? (
        <ol className={styles.history} aria-label="Status history">
          {incident.statusHistory.map((entry) => (
            <li key={`${entry.at}-${entry.from}-${entry.to}-${entry.actorId}`}>
              <span className={styles.historyChange}>
                {entry.from} → {entry.to}
              </span>
              <span className={styles.historyMeta}>
                {actorLabel(entry.actorId, entry.actorEmail, currentUserId)}
                {' · '}
                <time dateTime={entry.at}>{formatDateTime(entry.at)}</time>
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
