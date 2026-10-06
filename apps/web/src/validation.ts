import type { CreateProjectInput, CreateTaskInput } from '@pmp/contracts';

const PROJECT_NAME_MIN = 3;
const PROJECT_NAME_MAX = 80;
const PROJECT_DESCRIPTION_MAX = 300;
const TASK_TITLE_MIN = 3;
const TASK_TITLE_MAX = 120;
const TASK_DESCRIPTION_MAX = 500;

const hasRepeatedSpaces = (value: string): boolean => /\s{2,}/.test(value.trim());

export const validateProjectForm = (input: CreateProjectInput): string[] => {
  const errors: string[] = [];
  const name = input.name.trim();
  const description = input.description?.trim() ?? '';

  if (!name) {
    errors.push('Project name is required.');
  } else {
    if (name.length < PROJECT_NAME_MIN || name.length > PROJECT_NAME_MAX) {
      errors.push(`Project name must be ${PROJECT_NAME_MIN}-${PROJECT_NAME_MAX} characters.`);
    }
    if (hasRepeatedSpaces(name)) {
      errors.push('Project name cannot contain repeated spaces.');
    }
  }

  if (description.length > PROJECT_DESCRIPTION_MAX) {
    errors.push(`Project description must be ${PROJECT_DESCRIPTION_MAX} characters or fewer.`);
  }

  return errors;
};

export const validateTaskForm = (input: CreateTaskInput): string[] => {
  const errors: string[] = [];
  const title = input.title.trim();
  const description = input.description?.trim() ?? '';

  if (!input.projectId.trim()) {
    errors.push('A project must be selected.');
  }

  if (!title) {
    errors.push('Task title is required.');
  } else {
    if (title.length < TASK_TITLE_MIN || title.length > TASK_TITLE_MAX) {
      errors.push(`Task title must be ${TASK_TITLE_MIN}-${TASK_TITLE_MAX} characters.`);
    }
    if (hasRepeatedSpaces(title)) {
      errors.push('Task title cannot contain repeated spaces.');
    }
  }

  if (description.length > TASK_DESCRIPTION_MAX) {
    errors.push(`Task description must be ${TASK_DESCRIPTION_MAX} characters or fewer.`);
  }

  return errors;
};
