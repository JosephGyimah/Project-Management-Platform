create index if not exists idx_projects_status_created_at on projects (status, created_at desc);
create index if not exists idx_projects_created_at on projects (created_at desc);
create index if not exists idx_projects_search on projects using gin (search_text gin_trgm_ops);

create index if not exists idx_tasks_project_created_at on tasks (project_id, created_at desc);
create index if not exists idx_tasks_project_status_created_at on tasks (project_id, status, created_at desc);
create index if not exists idx_tasks_search on tasks using gin (search_text gin_trgm_ops);
