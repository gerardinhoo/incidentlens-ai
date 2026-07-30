import type { Incident } from '../../domain/src/index.js';

/**
 * Persistence boundary for incidents.
 * Implementations may be in-memory or DynamoDB-backed.
 */
export interface IncidentRepository {
  save(incident: Incident): Promise<Incident>;
  findById(id: string): Promise<Incident | undefined>;
  /** Returns all incidents newest createdAt first (stable tie-breakers). */
  findAll(): Promise<Incident[]>;
}
