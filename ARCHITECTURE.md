# Project Management Platform Architecture

## Shape

- `apps/web`: React + Vite UI shell. It consumes the API and never owns domain rules.
- `apps/api`: Node.js + Fastify HTTP boundary. Routes validate input, call application services, and map errors to HTTP.
- `packages/contracts`: shared TypeScript domain models and request/response contracts.
- PostgreSQL: system of record for users, projects, tasks, comments, and memberships.

The initial implementation keeps the repository deliberately thin: the API has a PostgreSQL health check and a read-only project endpoint placeholder, while the web app demonstrates the product shell. Repositories and migrations can be added behind the service boundary without changing clients.

## Domain model

- `User`: authenticated actor with an email and display name.
- `Project`: workspace owned by a user; has a lifecycle status.
- `Task`: work item belonging to a project and optionally assigned to a user.
- `Comment`: discussion attached to a task and authored by a user.

Relationships: `User 1..* Project` (owner), `Project 1..* Task`, `Task 1..* Comment`, and optional task assignment to `User`.

## REST contract

- `GET /health` -> `{ "status": "ok", "database": "up" | "down" }`
- `GET /api/projects` -> `{ "data": Project[] }`
- `POST /api/projects` body `{ "name": string, "description": string? }` -> `{ "data": Project }`
- `GET /api/projects/:projectId/tasks` -> `{ "data": Task[] }`
- `POST /api/tasks` body `{ "projectId": string, "title": string, "description": string? }` -> `{ "data": Task }`
- `POST /api/tasks/:taskId/comments` body `{ "body": string }` -> `{ "data": Comment }`

Errors use `{ "error": { "code": string, "message": string } }`.

## GraphQL mapping

A future `/graphql` endpoint can expose `projects`, `project(id)`, `tasks(projectId)`, and mutations `createProject`, `createTask`, `addComment`. The shared models remain the source of truth; GraphQL resolvers call the same application services as REST handlers.

## Workflow

This repository is suitable for a monorepo with trunk-based feature branches: `feat/<area>-<short-name>`, small PRs, and required `typecheck`/`build` checks. If teams need independent release cadence, split at the same boundaries into `pmp-web`, `pmp-api`, and `pmp-contracts`, publishing contracts as a versioned package.

## Delivery sequence

1. Add SQL migrations and repository implementations.
2. Add auth middleware and current-user context.
3. Implement project/task/comment services against the contracts.
4. Add API integration tests with a disposable PostgreSQL instance.
5. Replace the UI sample data with query/cache state and optimistic task updates.
