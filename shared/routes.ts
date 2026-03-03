import { z } from 'zod';
import { insertSimulationSchema, simulations } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  simulations: {
    create: {
      method: 'POST' as const,
      path: '/api/simulations' as const,
      input: insertSimulationSchema,
      responses: {
        201: z.custom<typeof simulations.$inferSelect>(),
        400: errorSchemas.validation,
      }
    },
    get: {
      method: 'GET' as const,
      path: '/api/simulations/:id' as const,
      responses: {
        200: z.custom<typeof simulations.$inferSelect>(),
        404: errorSchemas.notFound,
      }
    },
    downloadPdf: {
      method: 'GET' as const,
      path: '/api/simulations/:id/pdf' as const,
      responses: {
        200: z.custom<Blob>(),
        404: errorSchemas.notFound,
      }
    }
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

export type InsertSimulation = z.infer<typeof insertSimulationSchema>;
export type Simulation = typeof simulations.$inferSelect;
