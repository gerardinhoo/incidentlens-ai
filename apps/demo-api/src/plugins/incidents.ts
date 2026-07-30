import type { FastifyPluginCallback } from 'fastify';

import {
  createIncident,
  type CreateIncidentInput,
  type Incident,
} from '../../../../packages/domain/src/index.js';
import type { IncidentRepository } from '../../../../packages/repository/src/index.js';
import { createIncidentSchema } from '../schemas/create-incident.js';
import { getIncidentByIdSchema } from '../schemas/get-incident-by-id.js';
import type { IncidentNotFoundResponse } from '../types/incident-not-found.js';

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

      try {
        await options.repository.save(incident);
      } catch (error) {
        request.log.error(
          {
            incidentId: incident.id,
            severity: incident.severity,
            source: incident.source,
            requestId: request.id,
            err: error,
          },
          'failed to persist incident',
        );
        throw error;
      }

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

  fastify.get<{ Reply: Incident[] }>('/incidents', async (request, reply) => {
    const incidents = await options.repository.findAll();

    request.log.info(
      {
        incidentCount: incidents.length,
        requestId: request.id,
      },
      'incidents listed',
    );

    void reply.status(200);
    return incidents;
  });

  fastify.get<{
    Params: { id: string };
    Reply: Incident | IncidentNotFoundResponse;
  }>(
    '/incidents/:id',
    { schema: getIncidentByIdSchema },
    async (request, reply) => {
      const { id } = request.params;
      const incident = await options.repository.findById(id);

      if (incident === undefined) {
        request.log.info(
          {
            incidentId: id,
            requestId: request.id,
          },
          'incident not found',
        );

        void reply.status(404);
        return {
          status: 'error',
          message: 'Incident not found',
        };
      }

      request.log.info(
        {
          incidentId: incident.id,
          severity: incident.severity,
          source: incident.source,
          requestId: request.id,
        },
        'incident retrieved',
      );

      void reply.status(200);
      return incident;
    },
  );

  done();
};

export default incidentsPlugin;
