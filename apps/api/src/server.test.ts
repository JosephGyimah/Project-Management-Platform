import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  AuthUser,
  CreateProjectInput,
  CreateTaskInput,
  PaginatedApiResponse,
  Project,
  ProjectFilters,
  Task,
  TaskFilters,
  UpdateProjectInput,
  UpdateTaskInput,
  UserRole
} from '@pmp/contracts';
import { hashPassword } from './auth.js';
import { buildApp } from './server.js';
import type { DataStore } from './store.js';

type TestUser = AuthUser & { passwordHash: string };

type Session = { userId: string; expiresAt: Date; revokedAt?: Date };

class InMemoryAuthStore {
  constructor(private readonly users: TestUser[]) {}

  private sessions = new Map<string, Session>();

  async findUserByEmail(email: string) {
    return this.users.find((user) => user.email === email) ?? null;
  }

  async findUserById(userId: string) {
    return this.users.find((user) => user.id === userId) ?? null;
  }

  async createSession(userId: string, tokenHash: string, expiresAt: Date) {
    this.sessions.set(tokenHash, { userId, expiresAt });
  }

  async rotateSession(currentTokenHash: string, nextTokenHash: string, expiresAt: Date) {
    const existing = this.sessions.get(currentTokenHash);
    if (!existing || existing.revokedAt || existing.expiresAt <= new Date()) return null;
    this.sessions.delete(currentTokenHash);
    this.sessions.set(nextTokenHash, { userId: existing.userId, expiresAt });
    return this.findUserById(existing.userId);
  }

  async revokeSession(tokenHash: string) {
    const existing = this.sessions.get(tokenHash);
    if (!existing) return;
    this.sessions.set(tokenHash, { ...existing, revokedAt: new Date() });
  }

  async seedDefaultUsers() {}
}

class InMemoryStore implements DataStore {
  private projects = new Map<string, Project>();
  private tasks = new Map<string, Task>();

  private nextId(prefix: string): string {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }

  async listProjects(filters: ProjectFilters): Promise<PaginatedApiResponse<Project>> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 10;
    const search = filters.search?.toLowerCase();
    let items = Array.from(this.projects.values());

    if (filters.status) {
      items = items.filter((project) => project.status === filters.status);
    }

    if (search) {
      items = items.filter((project) => `${project.name} ${project.description ?? ''}`.toLowerCase().includes(search));
    }

    const total = items.length;
    const start = (page - 1) * pageSize;
    const data = items.slice(start, start + pageSize);

    return {
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize)
      }
    };
  }

  async getProjectById(projectId: string): Promise<Project | null> {
    return this.projects.get(projectId) ?? null;
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    const id = this.nextId('project');
    const project: Project = {
      id,
      name: input.name,
      description: input.description,
      ownerId: 'owner',
      status: 'active',
      createdAt: new Date().toISOString()
    };
    this.projects.set(id, project);
    return project;
  }

  async updateProject(projectId: string, input: UpdateProjectInput): Promise<Project | null> {
    const existing = this.projects.get(projectId);
    if (!existing) return null;
    const next = { ...existing, ...input };
    this.projects.set(projectId, next);
    return next;
  }

  async deleteProject(projectId: string): Promise<boolean> {
    this.projects.delete(projectId);
    for (const [taskId, task] of this.tasks.entries()) {
      if (task.projectId === projectId) {
        this.tasks.delete(taskId);
      }
    }
    return true;
  }

  async listTasks(filters: TaskFilters): Promise<PaginatedApiResponse<Task>> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 10;
    const search = filters.search?.toLowerCase();

    let items = Array.from(this.tasks.values()).filter((task) => task.projectId === filters.projectId);

    if (filters.status) {
      items = items.filter((task) => task.status === filters.status);
    }

    if (search) {
      items = items.filter((task) => `${task.title} ${task.description ?? ''}`.toLowerCase().includes(search));
    }

    const total = items.length;
    const start = (page - 1) * pageSize;

    return {
      data: items.slice(start, start + pageSize),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize)
      }
    };
  }

  async getTaskById(taskId: string): Promise<Task | null> {
    return this.tasks.get(taskId) ?? null;
  }

  async createTask(input: CreateTaskInput): Promise<Task | null> {
    if (!this.projects.has(input.projectId)) return null;
    const task: Task = {
      id: this.nextId('task'),
      projectId: input.projectId,
      title: input.title,
      description: input.description,
      status: input.status ?? 'todo',
      createdAt: new Date().toISOString()
    };

    this.tasks.set(task.id, task);
    return task;
  }

  async updateTask(taskId: string, input: UpdateTaskInput): Promise<Task | null> {
    const existing = this.tasks.get(taskId);
    if (!existing) return null;
    const next = { ...existing, ...input };
    this.tasks.set(taskId, next);
    return next;
  }

  async deleteTask(taskId: string): Promise<boolean> {
    return this.tasks.delete(taskId);
  }
}

const createUsers = async (): Promise<TestUser[]> => {
  const makeUser = async (id: string, role: UserRole, email: string, displayName: string, password: string): Promise<TestUser> => ({
    id,
    role,
    email,
    displayName,
    passwordHash: await hashPassword(password)
  });

  return Promise.all([
    makeUser('admin', 'admin', 'admin@pmp.local', 'Admin User', 'AdminPass123!'),
    makeUser('lead', 'project_lead', 'lead@pmp.local', 'Lead User', 'LeadPass123!'),
    makeUser('member', 'member', 'member@pmp.local', 'Member User', 'MemberPass123!')
  ]);
};

const login = async (app: Awaited<ReturnType<typeof buildApp>>, email: string, password: string) => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password }
  });

  assert.equal(response.statusCode, 200);
  const payload = response.json() as { data: { accessToken: string } };
  const setCookieHeader = response.headers['set-cookie'];
  const cookie = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  assert.ok(cookie);

  return { authorization: `****** cookie: cookie.split(';')[0] };
};

test('project and task CRUD with auth, search and pagination', async () => {
  const users = await createUsers();
  const app = await buildApp(new InMemoryStore(), new InMemoryAuthStore(users));
  const auth = await login(app, 'admin@pmp.local', 'AdminPass123!');

  const createProjectResponse = await app.inject({
    method: 'POST',
    url: '/api/projects',
    headers: { authorization: auth.authorization },
    payload: { name: 'Roadmap Planning', description: 'Q4 priorities' }
  });
  assert.equal(createProjectResponse.statusCode, 200);
  const project = (createProjectResponse.json() as { data: Project }).data;

  const createTaskResponse = await app.inject({
    method: 'POST',
    url: '/api/tasks',
    headers: { authorization: auth.authorization },
    payload: { projectId: project.id, title: 'Design release board', status: 'in_progress' }
  });

  assert.equal(createTaskResponse.statusCode, 200);

  const listProjectResponse = await app.inject({
    method: 'GET',
    url: '/api/projects?search=roadmap&page=1&pageSize=5',
    headers: { authorization: auth.authorization }
  });

  assert.equal(listProjectResponse.statusCode, 200);
  const projectsPayload = listProjectResponse.json() as PaginatedApiResponse<Project>;
  assert.equal(projectsPayload.data.length, 1);
  assert.equal(projectsPayload.pagination.total, 1);

  const listTasksResponse = await app.inject({
    method: 'GET',
    url: `/api/projects/${project.id}/tasks?status=in_progress&page=1&pageSize=10`,
    headers: { authorization: auth.authorization }
  });

  assert.equal(listTasksResponse.statusCode, 200);
  const tasksPayload = listTasksResponse.json() as PaginatedApiResponse<Task>;
  assert.equal(tasksPayload.data.length, 1);

  await app.close();
});

test('returns validation errors for invalid form input', async () => {
  const users = await createUsers();
  const app = await buildApp(new InMemoryStore(), new InMemoryAuthStore(users));
  const auth = await login(app, 'admin@pmp.local', 'AdminPass123!');

  const response = await app.inject({
    method: 'POST',
    url: '/api/projects',
    headers: { authorization: auth.authorization },
    payload: { name: 'a' }
  });

  assert.equal(response.statusCode, 400);
  const payload = response.json() as { error: { code: string; issues: Array<{ field: string }> } };
  assert.equal(payload.error.code, 'VALIDATION_ERROR');
  assert.ok(payload.error.issues.some((issue) => issue.field === 'name'));

  await app.close();
});

test('refresh endpoint rotates session and returns new access token', async () => {
  const users = await createUsers();
  const app = await buildApp(new InMemoryStore(), new InMemoryAuthStore(users));
  const auth = await login(app, 'member@pmp.local', 'MemberPass123!');

  const refreshResponse = await app.inject({
    method: 'POST',
    url: '/api/auth/refresh',
    headers: { cookie: auth.cookie }
  });

  assert.equal(refreshResponse.statusCode, 200);
  const payload = refreshResponse.json() as { data: { accessToken: string } };
  assert.ok(payload.data.accessToken.length > 10);

  await app.close();
});

test('member role cannot create projects', async () => {
  const users = await createUsers();
  const app = await buildApp(new InMemoryStore(), new InMemoryAuthStore(users));
  const auth = await login(app, 'member@pmp.local', 'MemberPass123!');

  const response = await app.inject({
    method: 'POST',
    url: '/api/projects',
    headers: { authorization: auth.authorization },
    payload: { name: 'Blocked Project' }
  });

  assert.equal(response.statusCode, 403);

  await app.close();
});
