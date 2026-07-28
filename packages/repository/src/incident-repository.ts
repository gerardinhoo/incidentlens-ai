import type { Incident } from '../../domain/src/index.js';

/**
 * Persistence boundary for incidents.
 * Memory-backed today; durable implementations come later.
 */
export interface IncidentRepository {
  save(incident: Incident): Promise<Incident>;
  findById(id: string): Promise<Incident | undefined>;
  findAll(): Promise<Incident[]>;
}
