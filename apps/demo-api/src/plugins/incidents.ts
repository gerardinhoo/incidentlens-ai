import type { FastifyPluginCallback } from 'fastify';

import {
  createIncident,
  transitionIncident,
  type CreateIncidentInput,
  type Incident,
} from '../../../../packages/domain/src/index.js';
import type { IncidentRepository } from '../../../../packages/repository/src/index.js';
import { createIncidentSchema } from '../schemas/create-incident.js';
import { getIncidentByIdSchema } from '../schemas/get-incident-by-id.js';
import {
  updateIncidentStatusSchema,
  type UpdateIncidentStatusBody,
} from '../schemas/update-incident-status.js';
import type { IncidentNotFoundResponse } from '../types/incident-not-found.js';
import type { IncidentStatusConflictResponse } from '../types/incident-status-conflict.js';
import { isInvalidIncidentStatusTransitionError } from './is-invalid-incident-status-transition-error.js';

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

  fastify.patch<{
    Params: { id: string };
    Body: UpdateIncidentStatusBody;
    Reply: Incident | IncidentNotFoundResponse | IncidentStatusConflictResponse;
  }>(
    '/incidents/:id/status',
    { schema: updateIncidentStatusSchema },
    async (request, reply) => {
      const { id } = request.params;
      const requestedStatus = request.body.status;

      const existing = await options.repository.findById(id);

      if (existing === undefined) {
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

      const previousStatus = existing.status;
      let updated: Incident;

      try {
        updated = transitionIncident(existing, requestedStatus);
      } catch (error) {
        if (isInvalidIncidentStatusTransitionError(error)) {
          request.log.info(
            {
              incidentId: id,
              previousStatus,
              requestedStatus,
              requestId: request.id,
            },
            'incident status transition rejected',
          );

          void reply.status(409);
          return {
            status: 'error',
            message: 'Invalid incident status transition',
          };
        }

        throw error;
      }

      await options.repository.save(updated);

      request.log.info(
        {
          incidentId: updated.id,
          previousStatus,
          newStatus: updated.status,
          requestId: request.id,
        },
        'incident status updated',
      );

      void reply.status(200);
      return updated;
    },
  );

  done();
};

export default incidentsPlugin;
