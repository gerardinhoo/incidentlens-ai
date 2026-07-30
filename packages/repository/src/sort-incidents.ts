import type { Incident } from '../../domain/src/index.js';

/**
 * Sorts incidents newest-first by createdAt.
 * Tie-breakers: updatedAt (newest first), then id (ascending) for stability.
 */
export function sortIncidentsNewestFirst(incidents: Incident[]): Incident[] {
  return [...incidents].sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return left.createdAt < right.createdAt ? 1 : -1;
    }

    if (left.updatedAt !== right.updatedAt) {
      return left.updatedAt < right.updatedAt ? 1 : -1;
    }

    if (left.id === right.id) {
      return 0;
    }

    return left.id < right.id ? -1 : 1;
  });
}
