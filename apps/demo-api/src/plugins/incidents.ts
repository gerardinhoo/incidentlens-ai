import type { FastifyPluginCallback } from 'fastify';

import {
  createIncident,
  type CreateIncidentInput,
  type Incident,
} from '../../../../packages/domain/src/index.js';
import { createIncidentSchema } from '../schemas/create-incident.js';

/**
 * Incident HTTP routes.
 *
 * Persistence is intentionally deferred to SCRUM-18. This plugin creates a
 * domain Incident in-memory and returns it; it does not store incidents.
 */
const incidentsPlugin: FastifyPluginCallback = (fastify, _opts, done) => {
  fastify.post<{ Body: CreateIncidentInput; Reply: Incident }>(
    '/incidents',
    { schema: createIncidentSchema },
    (request, reply) => {
      const incident = createIncident(request.body);

      request.log.info(
        {
          incidentId: incident.id,
          severity: incident.severity,
          source: incident.source,
          requestId: request.id,
        },
        'incident created',
      );

      void reply.status(201);
      return incident;
    },
  );

  done();
};

export default incidentsPlugin;
