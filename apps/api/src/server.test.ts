import test from 'node:test';
import assert from 'node:assert/strict';
import type { CreateProjectInput, CreateTaskInput, PaginatedApiResponse, Project, ProjectFilters, Task, TaskFilters, UpdateProjectInput, UpdateTaskInput } from '@pmp/contracts';
import { buildApp } from './server.js';
import type { DataStore } from './store.js';

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
      items = items.filter((project) =>
        `${project.name} ${project.description ?? ''}`.toLowerCase().includes(search)
      );
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
      items = items.filter((task) =>
        `${task.title} ${task.description ?? ''}`.toLowerCase().includes(search)
      );
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

test('project and task CRUD with search and pagination', async () => {
  const app = await buildApp(new InMemoryStore());

  const createProjectResponse = await app.inject({
    method: 'POST',
    url: '/api/projects',
    payload: { name: 'Roadmap Planning', description: 'Q4 priorities' }
  });
  assert.equal(createProjectResponse.statusCode, 200);
  const project = (createProjectResponse.json() as { data: Project }).data;

  const createTaskResponse = await app.inject({
    method: 'POST',
    url: '/api/tasks',
    payload: { projectId: project.id, title: 'Design release board', status: 'in_progress' }
  });

  assert.equal(createTaskResponse.statusCode, 200);

  const listProjectResponse = await app.inject({
    method: 'GET',
    url: '/api/projects?search=roadmap&page=1&pageSize=5'
  });

  assert.equal(listProjectResponse.statusCode, 200);
  const projectsPayload = listProjectResponse.json() as PaginatedApiResponse<Project>;
  assert.equal(projectsPayload.data.length, 1);
  assert.equal(projectsPayload.pagination.total, 1);

  const listTasksResponse = await app.inject({
    method: 'GET',
    url: `/api/projects/${project.id}/tasks?status=in_progress&page=1&pageSize=10`
  });

  assert.equal(listTasksResponse.statusCode, 200);
  const tasksPayload = listTasksResponse.json() as PaginatedApiResponse<Task>;
  assert.equal(tasksPayload.data.length, 1);

  await app.close();
});

test('returns validation errors for invalid form input', async () => {
  const app = await buildApp(new InMemoryStore());

  const response = await app.inject({
    method: 'POST',
    url: '/api/projects',
    payload: { name: 'a' }
  });

  assert.equal(response.statusCode, 400);
  const payload = response.json() as { error: { code: string; issues: Array<{ field: string }> } };
  assert.equal(payload.error.code, 'VALIDATION_ERROR');
  assert.ok(payload.error.issues.some((issue) => issue.field === 'name'));

  await app.close();
});
