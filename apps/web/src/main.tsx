import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { CreateProjectInput, CreateTaskInput, PaginatedApiResponse, Project, Task, TaskStatus } from '@pmp/contracts';
import { api } from './api';
import { validateProjectForm, validateTaskForm } from './validation';
import './styles.css';

type PaginationState = { page: number; pageSize: number; total: number; totalPages: number };

const defaultPagination: PaginationState = { page: 1, pageSize: 5, total: 0, totalPages: 0 };

const statusColumns: Array<{ status: TaskStatus; title: string }> = [
  { status: 'todo', title: 'To do' },
  { status: 'in_progress', title: 'In progress' },
  { status: 'done', title: 'Done' }
];

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projectQuery, setProjectQuery] = useState('');
  const [projectStatusFilter, setProjectStatusFilter] = useState<'all' | Project['status']>('all');
  const [taskQuery, setTaskQuery] = useState('');
  const [taskStatusFilter, setTaskStatusFilter] = useState<'all' | TaskStatus>('all');
  const [projectPagination, setProjectPagination] = useState<PaginationState>(defaultPagination);
  const [taskPagination, setTaskPagination] = useState<PaginationState>(defaultPagination);
  const [projectForm, setProjectForm] = useState<CreateProjectInput>({ name: '', description: '' });
  const [taskForm, setTaskForm] = useState<CreateTaskInput>({ projectId: '', title: '', description: '', status: 'todo' });
  const [projectErrors, setProjectErrors] = useState<string[]>([]);
  const [taskErrors, setTaskErrors] = useState<string[]>([]);
  const [message, setMessage] = useState('');

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId),
    [projects, selectedProjectId]
  );

  const refreshProjects = async (page = projectPagination.page) => {
    const response = await api.listProjects({
      search: projectQuery,
      status: projectStatusFilter === 'all' ? undefined : projectStatusFilter,
      page,
      pageSize: projectPagination.pageSize
    });
    setProjects(response.data);
    setProjectPagination(response.pagination);
    if (!selectedProjectId && response.data[0]) {
      setSelectedProjectId(response.data[0].id);
      setTaskForm((prev) => ({ ...prev, projectId: response.data[0].id }));
    }
  };

  const refreshTasks = async (projectId: string, page = taskPagination.page) => {
    if (!projectId) {
      setTasks([]);
      return;
    }

    const response = await api.listTasks({
      projectId,
      search: taskQuery,
      status: taskStatusFilter === 'all' ? undefined : taskStatusFilter,
      page,
      pageSize: taskPagination.pageSize
    });

    setTasks(response.data);
    setTaskPagination(response.pagination);
  };

  useEffect(() => {
    void refreshProjects(1).catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Unable to load projects.'));
  }, [projectQuery, projectStatusFilter]);

  useEffect(() => {
    if (!selectedProjectId) return;
    setTaskForm((prev) => ({ ...prev, projectId: selectedProjectId }));
    void refreshTasks(selectedProjectId, 1).catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Unable to load tasks.'));
  }, [selectedProjectId, taskQuery, taskStatusFilter]);

  const handleCreateProject = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors = validateProjectForm(projectForm);
    setProjectErrors(errors);
    if (errors.length > 0) return;

    const optimisticProject: Project = {
      id: `tmp_${Date.now()}`,
      name: projectForm.name.trim(),
      description: projectForm.description?.trim() || undefined,
      status: 'active',
      ownerId: 'pending',
      createdAt: new Date().toISOString()
    };

    const previousProjects = projects;
    setProjects((prev) => [optimisticProject, ...prev]);
    setSelectedProjectId(optimisticProject.id);

    try {
      const response = await api.createProject({
        name: projectForm.name.trim(),
        description: projectForm.description?.trim() || undefined
      });

      setProjects((prev) => prev.map((project) => (project.id === optimisticProject.id ? response.data : project)));
      setSelectedProjectId(response.data.id);
      setTaskForm((prev) => ({ ...prev, projectId: response.data.id }));
      setProjectForm({ name: '', description: '' });
      setMessage('Project created.');
      await refreshProjects(1);
    } catch (error) {
      setProjects(previousProjects);
      setMessage(error instanceof Error ? error.message : 'Could not create project.');
    }
  };

  const handleProjectStatus = async (project: Project, status: Project['status']) => {
    const previousProjects = projects;
    setProjects((prev) => prev.map((item) => (item.id === project.id ? { ...item, status } : item)));

    try {
      await api.updateProject(project.id, { status });
      setMessage(`Project marked as ${status}.`);
    } catch (error) {
      setProjects(previousProjects);
      setMessage(error instanceof Error ? error.message : 'Could not update project.');
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    const previousProjects = projects;
    const nextProjects = projects.filter((project) => project.id !== projectId);
    setProjects(nextProjects);

    if (selectedProjectId === projectId) {
      setSelectedProjectId(nextProjects[0]?.id ?? '');
    }

    try {
      await api.deleteProject(projectId);
      setMessage('Project deleted.');
      await refreshProjects(1);
    } catch (error) {
      setProjects(previousProjects);
      setMessage(error instanceof Error ? error.message : 'Could not delete project.');
    }
  };

  const handleCreateTask = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload: CreateTaskInput = {
      projectId: taskForm.projectId || selectedProjectId,
      title: taskForm.title,
      description: taskForm.description,
      status: taskForm.status
    };

    const errors = validateTaskForm(payload);
    setTaskErrors(errors);
    if (errors.length > 0) return;

    const optimisticTask: Task = {
      id: `tmp_${Date.now()}`,
      projectId: payload.projectId,
      title: payload.title.trim(),
      description: payload.description?.trim() || undefined,
      status: payload.status ?? 'todo',
      createdAt: new Date().toISOString()
    };

    const previousTasks = tasks;
    setTasks((prev) => [optimisticTask, ...prev]);

    try {
      const response = await api.createTask({
        projectId: payload.projectId,
        title: payload.title.trim(),
        description: payload.description?.trim() || undefined,
        status: payload.status
      });

      setTasks((prev) => prev.map((task) => (task.id === optimisticTask.id ? response.data : task)));
      setTaskForm({ projectId: payload.projectId, title: '', description: '', status: 'todo' });
      setMessage('Task added.');
      await refreshTasks(payload.projectId, 1);
    } catch (error) {
      setTasks(previousTasks);
      setMessage(error instanceof Error ? error.message : 'Could not create task.');
    }
  };

  const handleTaskStatus = async (task: Task, status: TaskStatus) => {
    const previousTasks = tasks;
    setTasks((prev) => prev.map((item) => (item.id === task.id ? { ...item, status } : item)));

    try {
      await api.updateTask(task.id, { status });
      setMessage('Task updated.');
    } catch (error) {
      setTasks(previousTasks);
      setMessage(error instanceof Error ? error.message : 'Could not update task.');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    const previousTasks = tasks;
    setTasks((prev) => prev.filter((task) => task.id !== taskId));

    try {
      await api.deleteTask(taskId);
      setMessage('Task deleted.');
      if (selectedProjectId) {
        await refreshTasks(selectedProjectId, 1);
      }
    } catch (error) {
      setTasks(previousTasks);
      setMessage(error instanceof Error ? error.message : 'Could not delete task.');
    }
  };

  return (
    <main className="app">
      <header>
        <h1>Project Management Platform</h1>
        {message && <p className="message">{message}</p>}
      </header>

      <section className="panel">
        <h2>Create project</h2>
        <form onSubmit={handleCreateProject} className="form-grid">
          <input
            placeholder="Project name"
            value={projectForm.name}
            onChange={(event) => setProjectForm((prev) => ({ ...prev, name: event.target.value }))}
          />
          <textarea
            placeholder="Description"
            value={projectForm.description ?? ''}
            onChange={(event) => setProjectForm((prev) => ({ ...prev, description: event.target.value }))}
          />
          <button type="submit">Create project</button>
        </form>
        {projectErrors.length > 0 && <p className="error">{projectErrors.join(' ')}</p>}
      </section>

      <section className="panel">
        <div className="row">
          <h2>Projects</h2>
          <input placeholder="Search projects" value={projectQuery} onChange={(event) => setProjectQuery(event.target.value)} />
          <select value={projectStatusFilter} onChange={(event) => setProjectStatusFilter(event.target.value as 'all' | Project['status'])}>
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <ul className="list">
          {projects.map((project) => (
            <li key={project.id} className={selectedProjectId === project.id ? 'selected' : ''}>
              <button onClick={() => setSelectedProjectId(project.id)}>{project.name}</button>
              <span>{project.status}</span>
              <div className="actions">
                <button onClick={() => handleProjectStatus(project, project.status === 'active' ? 'archived' : 'active')}>
                  {project.status === 'active' ? 'Archive' : 'Activate'}
                </button>
                <button onClick={() => handleDeleteProject(project.id)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
        <div className="pagination">
          <button disabled={projectPagination.page <= 1} onClick={() => void refreshProjects(projectPagination.page - 1)}>
            Previous
          </button>
          <span>
            {projectPagination.page} / {Math.max(projectPagination.totalPages, 1)} ({projectPagination.total})
          </span>
          <button
            disabled={projectPagination.page >= Math.max(projectPagination.totalPages, 1)}
            onClick={() => void refreshProjects(projectPagination.page + 1)}
          >
            Next
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="row">
          <h2>Task board {selectedProject ? `· ${selectedProject.name}` : ''}</h2>
          <input placeholder="Search tasks" value={taskQuery} onChange={(event) => setTaskQuery(event.target.value)} />
          <select value={taskStatusFilter} onChange={(event) => setTaskStatusFilter(event.target.value as 'all' | TaskStatus)}>
            <option value="all">All status</option>
            <option value="todo">To do</option>
            <option value="in_progress">In progress</option>
            <option value="done">Done</option>
          </select>
        </div>

        <form onSubmit={handleCreateTask} className="form-grid">
          <input
            placeholder="Task title"
            value={taskForm.title}
            onChange={(event) => setTaskForm((prev) => ({ ...prev, title: event.target.value }))}
          />
          <textarea
            placeholder="Task description"
            value={taskForm.description ?? ''}
            onChange={(event) => setTaskForm((prev) => ({ ...prev, description: event.target.value }))}
          />
          <select
            value={taskForm.status}
            onChange={(event) => setTaskForm((prev) => ({ ...prev, status: event.target.value as TaskStatus }))}
          >
            <option value="todo">To do</option>
            <option value="in_progress">In progress</option>
            <option value="done">Done</option>
          </select>
          <button type="submit" disabled={!selectedProjectId}>
            Add task
          </button>
        </form>
        {taskErrors.length > 0 && <p className="error">{taskErrors.join(' ')}</p>}

        <div className="board">
          {statusColumns.map((column) => (
            <article key={column.status}>
              <h3>{column.title}</h3>
              <ul>
                {tasks
                  .filter((task) => task.status === column.status)
                  .map((task) => (
                    <li key={task.id}>
                      <strong>{task.title}</strong>
                      {task.description && <p>{task.description}</p>}
                      <div className="actions">
                        {statusColumns
                          .filter((nextColumn) => nextColumn.status !== column.status)
                          .map((nextColumn) => (
                            <button key={nextColumn.status} onClick={() => handleTaskStatus(task, nextColumn.status)}>
                              Move to {nextColumn.title}
                            </button>
                          ))}
                        <button onClick={() => handleDeleteTask(task.id)}>Delete</button>
                      </div>
                    </li>
                  ))}
              </ul>
            </article>
          ))}
        </div>

        <div className="pagination">
          <button disabled={taskPagination.page <= 1 || !selectedProjectId} onClick={() => void refreshTasks(selectedProjectId, taskPagination.page - 1)}>
            Previous
          </button>
          <span>
            {taskPagination.page} / {Math.max(taskPagination.totalPages, 1)} ({taskPagination.total})
          </span>
          <button
            disabled={taskPagination.page >= Math.max(taskPagination.totalPages, 1) || !selectedProjectId}
            onClick={() => void refreshTasks(selectedProjectId, taskPagination.page + 1)}
          >
            Next
          </button>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
