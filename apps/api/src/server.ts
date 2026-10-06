import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import type {
  ApiError,
  ApiResponse,
  AuthResponse,
  AuthUser,
  CreateProjectInput,
  CreateTaskInput,
  LoginInput,
  PaginatedApiResponse,
  Project,
  ProjectFilters,
  Task,
  TaskFilters,
  UpdateProjectInput,
  UpdateTaskInput,
  UserRole,
  ValidationIssue
} from '@pmp/contracts';
import {
  createAccessToken,
  createRefreshToken,
  hashRefreshToken,
  parseCookie,
  refreshExpiryDate,
  refreshMaxAgeMs,
  verifyAccessToken,
  verifyPassword
} from './auth.js';
import { PgAuthStore } from './auth-store.js';
import { createPool, runMigrations } from './db.js';
import { PgStore, type DataStore } from './store.js';
import { parsePagination, validateCreateProject, validateCreateTask, validateUpdateProject, validateUpdateTask } from './validation.js';

type AuthStore = Pick<PgAuthStore, 'findUserByEmail' | 'findUserById' | 'createSession' | 'rotateSession' | 'revokeSession' | 'seedDefaultUsers'>;

const AUTHENTICATED_ROLES: UserRole[] = ['admin', 'project_lead', 'member'];

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

const unauthorized = (): ApiError => ({ error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } });
const forbidden = (): ApiError => ({ error: { code: 'FORBIDDEN', message: 'You do not have access to this resource.' } });

const toPublicUser = (user: AuthUser): AuthUser => ({
  id: user.id,
  email: user.email,
  displayName: user.displayName,
  role: user.role
});

const getBearerToken = (authorizationHeader: string | undefined): string | null => {
  if (!authorizationHeader?.toLowerCase().startsWith('bearer ')) return null;
  return authorizationHeader.slice(7).trim() || null;
};

const setRefreshCookie = (reply: { header: (name: string, value: string) => unknown }, token: string) => {
  const maxAgeSeconds = Math.floor(refreshMaxAgeMs() / 1000);
  reply.header('Set-Cookie', `refresh_token=${encodeURIComponent(token)}; HttpOnly; Path=/api/auth; SameSite=Lax; Max-Age=${maxAgeSeconds}`);
};

const clearRefreshCookie = (reply: { header: (name: string, value: string) => unknown }) => {
  reply.header('Set-Cookie', 'refresh_token=; HttpOnly; Path=/api/auth; SameSite=Lax; Max-Age=0');
};

export const buildApp = async (store: DataStore, authStore: AuthStore) => {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(sensible);

  const getAuthenticatedUser = async (authorizationHeader: string | undefined): Promise<AuthUser | null> => {
    const token = getBearerToken(authorizationHeader);
    if (!token) return null;
    const payload = verifyAccessToken(token);
    if (!payload) return null;
    return authStore.findUserById(payload.sub);
  };

  const requireRoles = async (
    request: { headers: { authorization?: string } },
    reply: { status: (code: number) => { send: (value: ApiError) => unknown } },
    allowedRoles: UserRole[]
  ): Promise<AuthUser | null> => {
    const user = await getAuthenticatedUser(request.headers.authorization);
    if (!user) {
      reply.status(401).send(unauthorized());
      return null;
    }
    if (!allowedRoles.includes(user.role)) {
      reply.status(403).send(forbidden());
      return null;
    }
    return user;
  };

  app.get('/health', async () => ({ status: 'ok', database: 'up' }));

  app.post('/api/auth/login', async (request, reply): Promise<AuthResponse | ApiError> => {
    const body = (request.body ?? {}) as Partial<LoginInput>;
    const email = body.email?.trim().toLowerCase();
    const password = body.password;

    if (!email || !password) {
      return reply.status(400).send(sendValidationError([{ field: 'credentials', message: 'Email and password are required.' }]));
    }

    const user = await authStore.findUserByEmail(email);
    if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      return reply.status(401).send({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials.' } });
    }

    const refreshToken = createRefreshToken();
    await authStore.createSession(user.id, hashRefreshToken(refreshToken), refreshExpiryDate());
    setRefreshCookie(reply, refreshToken);

    return {
      data: {
        user: toPublicUser(user),
        accessToken: createAccessToken({ sub: user.id, email: user.email, role: user.role })
      }
    };
  });

  app.post('/api/auth/refresh', async (request, reply): Promise<AuthResponse | ApiError> => {
    const currentToken = parseCookie(request.headers.cookie, 'refresh_token');
    if (!currentToken) {
      return reply.status(401).send(unauthorized());
    }

    const nextRefreshToken = createRefreshToken();
    const user = await authStore.rotateSession(hashRefreshToken(currentToken), hashRefreshToken(nextRefreshToken), refreshExpiryDate());

    if (!user) {
      clearRefreshCookie(reply);
      return reply.status(401).send(unauthorized());
    }

    setRefreshCookie(reply, nextRefreshToken);

    return {
      data: {
        user,
        accessToken: createAccessToken({ sub: user.id, email: user.email, role: user.role })
      }
    };
  });

  app.get('/api/auth/me', async (request, reply): Promise<ApiResponse<AuthUser> | ApiError> => {
    const user = await requireRoles(request, reply, AUTHENTICATED_ROLES);
    if (!user) return unauthorized();
    return { data: user };
  });

  app.post('/api/auth/logout', async (request, reply): Promise<{ data: { loggedOut: true } }> => {
    const currentToken = parseCookie(request.headers.cookie, 'refresh_token');
    if (currentToken) {
      await authStore.revokeSession(hashRefreshToken(currentToken));
    }
    clearRefreshCookie(reply);
    return { data: { loggedOut: true } };
  });

  app.get('/api/projects', async (request, reply): Promise<PaginatedApiResponse<Project> | ApiError> => {
    const user = await requireRoles(request, reply, AUTHENTICATED_ROLES);
    if (!user) return unauthorized();
    const query = request.query as Record<string, unknown>;
    return store.listProjects(toProjectFilters(query));
  });

  app.post('/api/projects', async (request, reply): Promise<ApiResponse<Project> | ApiError> => {
    const user = await requireRoles(request, reply, ['admin', 'project_lead']);
    if (!user) return unauthorized();

    const validation = validateCreateProject(request.body as CreateProjectInput);
    if (!validation.value) {
      return reply.status(400).send(sendValidationError(validation.issues));
    }

    const project = await store.createProject(validation.value);
    return { data: project };
  });

  app.get('/api/projects/:projectId', async (request, reply): Promise<ApiResponse<Project> | ApiError> => {
    const user = await requireRoles(request, reply, AUTHENTICATED_ROLES);
    if (!user) return unauthorized();

    const { projectId } = request.params as { projectId: string };
    const project = await store.getProjectById(projectId);

    if (!project) {
      return reply.status(404).send({ error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found.' } });
    }

    return { data: project };
  });

  app.put('/api/projects/:projectId', async (request, reply): Promise<ApiResponse<Project> | ApiError> => {
    const user = await requireRoles(request, reply, ['admin', 'project_lead']);
    if (!user) return unauthorized();

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
    const user = await requireRoles(request, reply, ['admin']);
    if (!user) return unauthorized();

    const { projectId } = request.params as { projectId: string };
    const deleted = await store.deleteProject(projectId);

    if (!deleted) {
      return reply.status(404).send({ error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found.' } });
    }

    return { data: { deleted: true } };
  });

  app.get('/api/projects/:projectId/tasks', async (request, reply): Promise<PaginatedApiResponse<Task> | ApiError> => {
    const user = await requireRoles(request, reply, AUTHENTICATED_ROLES);
    if (!user) return unauthorized();

    const { projectId } = request.params as { projectId: string };
    const query = request.query as Record<string, unknown>;
    return store.listTasks(toTaskFilters(projectId, query));
  });

  app.post('/api/tasks', async (request, reply): Promise<ApiResponse<Task> | ApiError> => {
    const user = await requireRoles(request, reply, AUTHENTICATED_ROLES);
    if (!user) return unauthorized();

    const validation = validateCreateTask(request.body as CreateTaskInput);
    if (!validation.value) {
      return reply.status(400).send(sendValidationError(validation.issues));
    }

    const task = await store.createTask(validation.value);

    if (!task) {
      return reply.status(404).send({ error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found.' } });
    }

    return { data: task };
  });

  app.get('/api/tasks/:taskId', async (request, reply): Promise<ApiResponse<Task> | ApiError> => {
    const user = await requireRoles(request, reply, AUTHENTICATED_ROLES);
    if (!user) return unauthorized();

    const { taskId } = request.params as { taskId: string };
    const task = await store.getTaskById(taskId);

    if (!task) {
      return reply.status(404).send({ error: { code: 'TASK_NOT_FOUND', message: 'Task not found.' } });
    }

    return { data: task };
  });

  app.put('/api/tasks/:taskId', async (request, reply): Promise<ApiResponse<Task> | ApiError> => {
    const user = await requireRoles(request, reply, AUTHENTICATED_ROLES);
    if (!user) return unauthorized();

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
    const user = await requireRoles(request, reply, ['admin', 'project_lead']);
    if (!user) return unauthorized();

    const { taskId } = request.params as { taskId: string };
    const deleted = await store.deleteTask(taskId);

    if (!deleted) {
      return reply.status(404).send({ error: { code: 'TASK_NOT_FOUND', message: 'Task not found.' } });
    }

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
  const authStore = new PgAuthStore(pool);
  await authStore.seedDefaultUsers();
  const store = new PgStore(pool);
  await store.init();
  const app = await buildApp(store, authStore);
  await app.listen({ port, host: '0.0.0.0' });
};

if (import.meta.url === `file://${process.argv[1]}`) {
  await start();
}
