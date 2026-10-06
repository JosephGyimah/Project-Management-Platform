import type { CreateProjectInput, CreateTaskInput, ProjectStatus, TaskStatus, UpdateProjectInput, UpdateTaskInput, ValidationIssue } from '@pmp/contracts';

const PROJECT_NAME_MIN = 3;
const PROJECT_NAME_MAX = 80;
const PROJECT_DESCRIPTION_MAX = 300;
const TASK_TITLE_MIN = 3;
const TASK_TITLE_MAX = 120;
const TASK_DESCRIPTION_MAX = 500;

const PROJECT_STATUSES: ProjectStatus[] = ['active', 'archived'];
const TASK_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'done'];

const hasInvalidWhitespace = (value: string): boolean => /\s{2,}/.test(value.trim());

const normalizeText = (value?: string): string | undefined => {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export const parsePagination = (input: { page?: number; pageSize?: number }) => {
  const page = Number.isFinite(input.page) ? Number(input.page) : 1;
  const pageSize = Number.isFinite(input.pageSize) ? Number(input.pageSize) : 10;
  return {
    page: Math.max(1, Math.floor(page)),
    pageSize: Math.min(50, Math.max(1, Math.floor(pageSize)))
  };
};

export const validateCreateProject = (payload: CreateProjectInput): { value?: CreateProjectInput; issues: ValidationIssue[] } => {
  const name = normalizeText(payload.name);
  const description = normalizeText(payload.description);
  const issues: ValidationIssue[] = [];

  if (!name) {
    issues.push({ field: 'name', message: 'Project name is required.' });
  } else {
    if (name.length < PROJECT_NAME_MIN || name.length > PROJECT_NAME_MAX) {
      issues.push({ field: 'name', message: `Project name must be ${PROJECT_NAME_MIN}-${PROJECT_NAME_MAX} characters.` });
    }
    if (hasInvalidWhitespace(name)) {
      issues.push({ field: 'name', message: 'Project name cannot contain repeated spaces.' });
    }
  }

  if (description && description.length > PROJECT_DESCRIPTION_MAX) {
    issues.push({ field: 'description', message: `Description must be at most ${PROJECT_DESCRIPTION_MAX} characters.` });
  }

  if (issues.length > 0 || !name) return { issues };
  return { value: { name, description }, issues };
};

export const validateUpdateProject = (payload: UpdateProjectInput): { value?: UpdateProjectInput; issues: ValidationIssue[] } => {
  const issues: ValidationIssue[] = [];
  const value: UpdateProjectInput = {};

  if (payload.name !== undefined) {
    const name = normalizeText(payload.name);
    if (!name) {
      issues.push({ field: 'name', message: 'Project name cannot be empty.' });
    } else {
      if (name.length < PROJECT_NAME_MIN || name.length > PROJECT_NAME_MAX) {
        issues.push({ field: 'name', message: `Project name must be ${PROJECT_NAME_MIN}-${PROJECT_NAME_MAX} characters.` });
      }
      if (hasInvalidWhitespace(name)) {
        issues.push({ field: 'name', message: 'Project name cannot contain repeated spaces.' });
      }
      value.name = name;
    }
  }

  if (payload.description !== undefined) {
    const description = normalizeText(payload.description);
    if (description && description.length > PROJECT_DESCRIPTION_MAX) {
      issues.push({ field: 'description', message: `Description must be at most ${PROJECT_DESCRIPTION_MAX} characters.` });
    }
    value.description = description;
  }

  if (payload.status !== undefined) {
    if (!PROJECT_STATUSES.includes(payload.status)) {
      issues.push({ field: 'status', message: 'Invalid project status.' });
    } else {
      value.status = payload.status;
    }
  }

  if (Object.keys(value).length === 0) {
    issues.push({ field: 'body', message: 'Provide at least one field to update.' });
  }

  if (issues.length > 0) return { issues };
  return { value, issues };
};

export const validateCreateTask = (payload: CreateTaskInput): { value?: CreateTaskInput; issues: ValidationIssue[] } => {
  const projectId = normalizeText(payload.projectId);
  const title = normalizeText(payload.title);
  const description = normalizeText(payload.description);
  const status = payload.status ?? 'todo';
  const issues: ValidationIssue[] = [];

  if (!projectId) {
    issues.push({ field: 'projectId', message: 'Project is required.' });
  }

  if (!title) {
    issues.push({ field: 'title', message: 'Task title is required.' });
  } else {
    if (title.length < TASK_TITLE_MIN || title.length > TASK_TITLE_MAX) {
      issues.push({ field: 'title', message: `Task title must be ${TASK_TITLE_MIN}-${TASK_TITLE_MAX} characters.` });
    }
    if (hasInvalidWhitespace(title)) {
      issues.push({ field: 'title', message: 'Task title cannot contain repeated spaces.' });
    }
  }

  if (description && description.length > TASK_DESCRIPTION_MAX) {
    issues.push({ field: 'description', message: `Description must be at most ${TASK_DESCRIPTION_MAX} characters.` });
  }

  if (!TASK_STATUSES.includes(status)) {
    issues.push({ field: 'status', message: 'Invalid task status.' });
  }

  if (issues.length > 0 || !projectId || !title) return { issues };

  return {
    value: { projectId, title, description, status },
    issues
  };
};

export const validateUpdateTask = (payload: UpdateTaskInput): { value?: UpdateTaskInput; issues: ValidationIssue[] } => {
  const issues: ValidationIssue[] = [];
  const value: UpdateTaskInput = {};

  if (payload.title !== undefined) {
    const title = normalizeText(payload.title);
    if (!title) {
      issues.push({ field: 'title', message: 'Task title cannot be empty.' });
    } else {
      if (title.length < TASK_TITLE_MIN || title.length > TASK_TITLE_MAX) {
        issues.push({ field: 'title', message: `Task title must be ${TASK_TITLE_MIN}-${TASK_TITLE_MAX} characters.` });
      }
      if (hasInvalidWhitespace(title)) {
        issues.push({ field: 'title', message: 'Task title cannot contain repeated spaces.' });
      }
      value.title = title;
    }
  }

  if (payload.description !== undefined) {
    const description = normalizeText(payload.description);
    if (description && description.length > TASK_DESCRIPTION_MAX) {
      issues.push({ field: 'description', message: `Description must be at most ${TASK_DESCRIPTION_MAX} characters.` });
    }
    value.description = description;
  }

  if (payload.status !== undefined) {
    if (!TASK_STATUSES.includes(payload.status)) {
      issues.push({ field: 'status', message: 'Invalid task status.' });
    } else {
      value.status = payload.status;
    }
  }

  if (Object.keys(value).length === 0) {
    issues.push({ field: 'body', message: 'Provide at least one field to update.' });
  }

  if (issues.length > 0) return { issues };
  return { value, issues };
};
