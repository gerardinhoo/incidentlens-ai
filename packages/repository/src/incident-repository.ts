import type { Incident } from '../../domain/src/index.js';

/**
 * Result of an idempotent create-only write.
 * Distinct from unconditional save() used for status updates.
 */
export type SaveIfAbsentResult = 'created' | 'duplicate';

/**
 * Persistence boundary for incidents.
 * Implementations may be in-memory or DynamoDB-backed.
 */
export interface IncidentRepository {
  /** Unconditional put/overwrite (e.g. status transitions). */
  save(incident: Incident): Promise<Incident>;

  /**
   * Create-only write keyed by incident.id.
   * Returns "created" when stored, "duplicate" when the id already exists
   * (existing item must not be overwritten).
   */
  saveIfAbsent(incident: Incident): Promise<SaveIfAbsentResult>;

  findById(id: string): Promise<Incident | undefined>;
  /** Returns all incidents newest createdAt first (stable tie-breakers). */
  findAll(): Promise<Incident[]>;
}
