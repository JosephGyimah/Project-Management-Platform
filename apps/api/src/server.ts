import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { Pool } from 'pg';
import type { ApiResponse, Project } from '@pmp/contracts';

const app = Fastify({ logger: true });
const port = Number(process.env.API_PORT ?? 4000);
const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? 'postgres://pmp:pmp@localhost:5432/pmp' });

await app.register(cors, { origin: true });
await app.register(sensible);

app.get('/health', async () => {
  try {
    await pool.query('select 1');
    return { status: 'ok', database: 'up' };
  } catch {
    return { status: 'ok', database: 'down' };
  }
});

app.get('/api/projects', async (): Promise<ApiResponse<Project[]>> => ({ data: [] }));

app.get('/api/projects/:projectId/tasks', async () => ({ data: [] }));

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);
  return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } });
});

await app.listen({ port, host: '0.0.0.0' });
