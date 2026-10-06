import type {
  CreateProjectInput,
  CreateTaskInput,
  PaginatedApiResponse,
  Project,
  ProjectFilters,
  Task,
  TaskFilters,
  UpdateProjectInput,
  UpdateTaskInput
} from '@pmp/contracts';
import type { Pool } from 'pg';

type QueryFilters = {
  search?: string;
  status?: string;
  page: number;
  pageSize: number;
};

export interface DataStore {
  listProjects(filters: ProjectFilters): Promise<PaginatedApiResponse<Project>>;
  getProjectById(projectId: string): Promise<Project | null>;
  createProject(input: CreateProjectInput): Promise<Project>;
  updateProject(projectId: string, input: UpdateProjectInput): Promise<Project | null>;
  deleteProject(projectId: string): Promise<boolean>;
  listTasks(filters: TaskFilters): Promise<PaginatedApiResponse<Task>>;
  getTaskById(taskId: string): Promise<Task | null>;
  createTask(input: CreateTaskInput): Promise<Task | null>;
  updateTask(taskId: string, input: UpdateTaskInput): Promise<Task | null>;
  deleteTask(taskId: string): Promise<boolean>;
}

const DEFAULT_OWNER_EMAIL = 'owner@pmp.local';
const DEFAULT_OWNER_NAME = 'Platform Owner';

const toProject = (row: Record<string, unknown>): Project => ({
  id: String(row.id),
  name: String(row.name),
  description: row.description ? String(row.description) : undefined,
  status: String(row.status) as Project['status'],
  ownerId: String(row.owner_id),
  createdAt: new Date(String(row.created_at)).toISOString()
});

const toTask = (row: Record<string, unknown>): Task => ({
  id: String(row.id),
  projectId: String(row.project_id),
  title: String(row.title),
  description: row.description ? String(row.description) : undefined,
  status: String(row.status) as Task['status'],
  assigneeId: row.assignee_id ? String(row.assignee_id) : undefined,
  createdAt: new Date(String(row.created_at)).toISOString()
});

const toQueryFilters = (filters: QueryFilters): QueryFilters => ({
  search: filters.search?.trim() || undefined,
  status: filters.status,
  page: Math.max(1, filters.page),
  pageSize: Math.min(50, Math.max(1, filters.pageSize))
});

const toPagination = (total: number, page: number, pageSize: number) => ({
  page,
  pageSize,
  total,
  totalPages: total === 0 ? 0 : Math.ceil(total / pageSize)
});

export class PgStore implements DataStore {
  constructor(private readonly pool: Pool) {}

  async init(): Promise<void> {
    await this.pool.query(
      `insert into users (email, display_name)
       values ($1, $2)
       on conflict (email)
       do update set display_name = excluded.display_name`,
      [DEFAULT_OWNER_EMAIL, DEFAULT_OWNER_NAME]
    );
  }

  async listProjects(filters: ProjectFilters): Promise<PaginatedApiResponse<Project>> {
    const queryFilters = toQueryFilters({
      search: filters.search,
      status: filters.status,
      page: filters.page ?? 1,
      pageSize: filters.pageSize ?? 10
    });
    const offset = (queryFilters.page - 1) * queryFilters.pageSize;
    const result = await this.pool.query(
      `with filtered as (
         select
           p.id,
           p.name,
           p.description,
           p.status,
           p.owner_id,
           p.created_at,
           count(*) over() as total_count
         from projects p
         where ($1::text is null or p.search_text ilike '%' || $1 || '%')
           and ($2::text is null or p.status = $2)
         order by p.created_at desc
         offset $3 limit $4
       )
       select * from filtered`,
      [queryFilters.search ?? null, queryFilters.status ?? null, offset, queryFilters.pageSize]
    );

    const total = Number(result.rows[0]?.total_count ?? 0);

    return {
      data: result.rows.map((row) => toProject(row)),
      pagination: toPagination(total, queryFilters.page, queryFilters.pageSize)
    };
  }

  async getProjectById(projectId: string): Promise<Project | null> {
    const result = await this.pool.query(
      `select id, name, description, status, owner_id, created_at
       from projects
       where id = $1`,
      [projectId]
    );
    return result.rowCount ? toProject(result.rows[0]) : null;
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    const result = await this.pool.query(
      `insert into projects (owner_id, name, description)
       values ((select id from users where email = $1), $2, $3)
       returning id, name, description, status, owner_id, created_at`,
      [DEFAULT_OWNER_EMAIL, input.name, input.description ?? null]
    );

    return toProject(result.rows[0]);
  }

  async updateProject(projectId: string, input: UpdateProjectInput): Promise<Project | null> {
    const fields: string[] = [];
    const values: Array<string | null> = [];

    if (input.name !== undefined) {
      values.push(input.name);
      fields.push(`name = $${values.length}`);
    }
    if (input.description !== undefined) {
      values.push(input.description ?? null);
      fields.push(`description = $${values.length}`);
    }
    if (input.status !== undefined) {
      values.push(input.status);
      fields.push(`status = $${values.length}`);
    }

    if (fields.length === 0) return null;

    values.push(projectId);

    const result = await this.pool.query(
      `update projects
       set ${fields.join(', ')}
       where id = $${values.length}
       returning id, name, description, status, owner_id, created_at`,
      values
    );

    return result.rowCount ? toProject(result.rows[0]) : null;
  }

  async deleteProject(projectId: string): Promise<boolean> {
    const result = await this.pool.query('delete from projects where id = $1', [projectId]);
    return result.rowCount > 0;
  }

  async listTasks(filters: TaskFilters): Promise<PaginatedApiResponse<Task>> {
    const queryFilters = toQueryFilters({
      search: filters.search,
      status: filters.status,
      page: filters.page ?? 1,
      pageSize: filters.pageSize ?? 10
    });

    const offset = (queryFilters.page - 1) * queryFilters.pageSize;

    const result = await this.pool.query(
      `with filtered as (
         select
           t.id,
           t.project_id,
           t.title,
           t.description,
           t.status,
           t.assignee_id,
           t.created_at,
           count(*) over() as total_count
         from tasks t
         where t.project_id = $1
           and ($2::text is null or t.search_text ilike '%' || $2 || '%')
           and ($3::text is null or t.status = $3)
         order by t.created_at desc
         offset $4 limit $5
       )
       select * from filtered`,
      [filters.projectId, queryFilters.search ?? null, queryFilters.status ?? null, offset, queryFilters.pageSize]
    );

    const total = Number(result.rows[0]?.total_count ?? 0);

    return {
      data: result.rows.map((row) => toTask(row)),
      pagination: toPagination(total, queryFilters.page, queryFilters.pageSize)
    };
  }

  async getTaskById(taskId: string): Promise<Task | null> {
    const result = await this.pool.query(
      `select id, project_id, title, description, status, assignee_id, created_at
       from tasks
       where id = $1`,
      [taskId]
    );
    return result.rowCount ? toTask(result.rows[0]) : null;
  }

  async createTask(input: CreateTaskInput): Promise<Task | null> {
    const result = await this.pool.query(
      `insert into tasks (project_id, title, description, status)
       values ($1, $2, $3, $4)
       returning id, project_id, title, description, status, assignee_id, created_at`,
      [input.projectId, input.title, input.description ?? null, input.status ?? 'todo']
    );

    return result.rowCount ? toTask(result.rows[0]) : null;
  }

  async updateTask(taskId: string, input: UpdateTaskInput): Promise<Task | null> {
    const fields: string[] = [];
    const values: Array<string | null> = [];

    if (input.title !== undefined) {
      values.push(input.title);
      fields.push(`title = $${values.length}`);
    }
    if (input.description !== undefined) {
      values.push(input.description ?? null);
      fields.push(`description = $${values.length}`);
    }
    if (input.status !== undefined) {
      values.push(input.status);
      fields.push(`status = $${values.length}`);
    }

    if (fields.length === 0) return null;

    values.push(taskId);

    const result = await this.pool.query(
      `update tasks
       set ${fields.join(', ')}
       where id = $${values.length}
       returning id, project_id, title, description, status, assignee_id, created_at`,
      values
    );

    return result.rowCount ? toTask(result.rows[0]) : null;
  }

  async deleteTask(taskId: string): Promise<boolean> {
    const result = await this.pool.query('delete from tasks where id = $1', [taskId]);
    return result.rowCount > 0;
  }
}
