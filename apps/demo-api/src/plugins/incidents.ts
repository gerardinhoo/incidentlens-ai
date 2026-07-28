import type { FastifyPluginCallback } from 'fastify';

import {
  createIncident,
  type CreateIncidentInput,
  type Incident,
} from '../../../../packages/domain/src/index.js';
import type { IncidentRepository } from '../../../../packages/repository/src/index.js';
import { createIncidentSchema } from '../schemas/create-incident.js';

export type IncidentsPluginOptions = {
  repository: IncidentRepository;
};

/**
 * Incident HTTP routes backed by an IncidentRepository.
 * The repository is provided by the application composition root.
 */
const incidentsPlugin: FastifyPluginCallback<IncidentsPluginOptions> = (
  fastify,
  options,
  done,
) => {
  fastify.post<{ Body: CreateIncidentInput; Reply: Incident }>(
    '/incidents',
    { schema: createIncidentSchema },
    async (request, reply) => {
      const incident = createIncident(request.body);
      await options.repository.save(incident);

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
