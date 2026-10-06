import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import websocket from '@fastify/websocket';
import type {
  ApiError,
  ApiResponse,
  CreateProjectInput,
  CreateTaskInput,
  PaginatedApiResponse,
  Project,
  ProjectFilters,
  RealtimeEvent,
  Task,
  TaskFilters,
  UpdateProjectInput,
  UpdateTaskInput,
  ValidationIssue
} from '@pmp/contracts';
import { createPool, runMigrations } from './db.js';
import { PgStore, type DataStore } from './store.js';
import { parsePagination, validateCreateProject, validateCreateTask, validateUpdateProject, validateUpdateTask } from './validation.js';
import type { WebSocket } from 'ws';

const toProjectFilters = (query: Record<string, unknown>): ProjectFilters => {
  const pagination = parsePagination({
    page: query.page ? Number(query.page) : undefined,
    pageSize: query.pageSize ? Number(query.pageSize) : undefined
  });

  return {
    search: typeof query.search === 'string' ? query.search : undefined,
    status: typeof query.status === 'string' ? (query.status as Project['status']) : undefined,
    page: pagination.page,
    pageSize: pagination.pageSize
  };
};

const toTaskFilters = (projectId: string, query: Record<string, unknown>): TaskFilters => {
  const pagination = parsePagination({
    page: query.page ? Number(query.page) : undefined,
    pageSize: query.pageSize ? Number(query.pageSize) : undefined
  });

  return {
    projectId,
    search: typeof query.search === 'string' ? query.search : undefined,
    status: typeof query.status === 'string' ? (query.status as Task['status']) : undefined,
    page: pagination.page,
    pageSize: pagination.pageSize
  };
};

const sendValidationError = (issues: ValidationIssue[]): ApiError => ({
  error: {
    code: 'VALIDATION_ERROR',
    message: 'Validation failed.',
    issues
  }
});

export const buildApp = async (store: DataStore) => {
  const app = Fastify({ logger: true });
  const realtimeSubscribers = new Set<WebSocket>();

  await app.register(cors, { origin: true });
  await app.register(sensible);
  await app.register(websocket);

  const broadcastEvent = (event: RealtimeEvent): void => {
    const payload = JSON.stringify(event);
    for (const subscriber of realtimeSubscribers) {
      if (subscriber.readyState !== 1) {
        realtimeSubscribers.delete(subscriber);
        continue;
      }

      subscriber.send(payload);
    }
  };

  app.get('/api/events', { websocket: true }, (connection) => {
    realtimeSubscribers.add(connection.socket);

    connection.socket.send(
      JSON.stringify({
        type: 'system.connected',
        entity: 'system',
        entityId: 'events',
        message: 'Realtime notifications connected.',
        createdAt: new Date().toISOString()
      } satisfies RealtimeEvent)
    );

    connection.socket.on('close', () => {
      realtimeSubscribers.delete(connection.socket);
    });
  });

  app.get('/health', async () => ({ status: 'ok', database: 'up' }));

  app.get('/api/projects', async (request): Promise<PaginatedApiResponse<Project>> => {
    const query = request.query as Record<string, unknown>;
    return store.listProjects(toProjectFilters(query));
  });

  app.post('/api/projects', async (request, reply): Promise<ApiResponse<Project> | ApiError> => {
    const validation = validateCreateProject(request.body as CreateProjectInput);
    if (!validation.value) {
      return reply.status(400).send(sendValidationError(validation.issues));
    }

    const project = await store.createProject(validation.value);
    broadcastEvent({
      type: 'project.created',
      entity: 'project',
      entityId: project.id,
      message: `Project "${project.name}" created.`,
      createdAt: new Date().toISOString()
    });
    return { data: project };
  });

  app.get('/api/projects/:projectId', async (request, reply): Promise<ApiResponse<Project> | ApiError> => {
    const { projectId } = request.params as { projectId: string };
    const project = await store.getProjectById(projectId);

    if (!project) {
      return reply.status(404).send({ error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found.' } });
    }

    broadcastEvent({
      type: 'project.updated',
      entity: 'project',
      entityId: project.id,
      message: `Project "${project.name}" updated.`,
      createdAt: new Date().toISOString()
    });

    return { data: project };
  });

  app.put('/api/projects/:projectId', async (request, reply): Promise<ApiResponse<Project> | ApiError> => {
    const { projectId } = request.params as { projectId: string };
    const validation = validateUpdateProject(request.body as UpdateProjectInput);

    if (!validation.value) {
      return reply.status(400).send(sendValidationError(validation.issues));
    }

    const project = await store.updateProject(projectId, validation.value);

    if (!project) {
      return reply.status(404).send({ error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found.' } });
    }

    return { data: project };
  });

  app.delete('/api/projects/:projectId', async (request, reply): Promise<{ data: { deleted: boolean } } | ApiError> => {
    const { projectId } = request.params as { projectId: string };
    const deleted = await store.deleteProject(projectId);

    if (!deleted) {
      return reply.status(404).send({ error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found.' } });
    }

    broadcastEvent({
      type: 'project.deleted',
      entity: 'project',
      entityId: projectId,
      message: 'Project deleted.',
      createdAt: new Date().toISOString()
    });

    return { data: { deleted: true } };
  });

  app.get('/api/projects/:projectId/tasks', async (request): Promise<PaginatedApiResponse<Task>> => {
    const { projectId } = request.params as { projectId: string };
    const query = request.query as Record<string, unknown>;
    return store.listTasks(toTaskFilters(projectId, query));
  });

  app.post('/api/tasks', async (request, reply): Promise<ApiResponse<Task> | ApiError> => {
    const validation = validateCreateTask(request.body as CreateTaskInput);
    if (!validation.value) {
      return reply.status(400).send(sendValidationError(validation.issues));
    }

    const task = await store.createTask(validation.value);

    if (!task) {
      return reply.status(404).send({ error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found.' } });
    }

    broadcastEvent({
      type: 'task.created',
      entity: 'task',
      entityId: task.id,
      projectId: task.projectId,
      message: `Task "${task.title}" created.`,
      createdAt: new Date().toISOString()
    });

    return { data: task };
  });

  app.get('/api/tasks/:taskId', async (request, reply): Promise<ApiResponse<Task> | ApiError> => {
    const { taskId } = request.params as { taskId: string };
    const task = await store.getTaskById(taskId);

    if (!task) {
      return reply.status(404).send({ error: { code: 'TASK_NOT_FOUND', message: 'Task not found.' } });
    }

    broadcastEvent({
      type: 'task.updated',
      entity: 'task',
      entityId: task.id,
      projectId: task.projectId,
      message: `Task "${task.title}" updated.`,
      createdAt: new Date().toISOString()
    });

    return { data: task };
  });

  app.put('/api/tasks/:taskId', async (request, reply): Promise<ApiResponse<Task> | ApiError> => {
    const { taskId } = request.params as { taskId: string };
    const validation = validateUpdateTask(request.body as UpdateTaskInput);

    if (!validation.value) {
      return reply.status(400).send(sendValidationError(validation.issues));
    }

    const task = await store.updateTask(taskId, validation.value);

    if (!task) {
      return reply.status(404).send({ error: { code: 'TASK_NOT_FOUND', message: 'Task not found.' } });
    }

    return { data: task };
  });

  app.delete('/api/tasks/:taskId', async (request, reply): Promise<{ data: { deleted: boolean } } | ApiError> => {
    const { taskId } = request.params as { taskId: string };
    const deleted = await store.deleteTask(taskId);

    if (!deleted) {
      return reply.status(404).send({ error: { code: 'TASK_NOT_FOUND', message: 'Task not found.' } });
    }

    broadcastEvent({
      type: 'task.deleted',
      entity: 'task',
      entityId: taskId,
      message: 'Task deleted.',
      createdAt: new Date().toISOString()
    });

    return { data: { deleted: true } };
  });

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } });
  });

  return app;
};

export const start = async () => {
  const port = Number(process.env.API_PORT ?? 4000);
  const pool = createPool();
  await runMigrations(pool);
  const store = new PgStore(pool);
  await store.init();
  const app = await buildApp(store);
  await app.listen({ port, host: '0.0.0.0' });
};

if (import.meta.url === `file://${process.argv[1]}`) {
  await start();
}
