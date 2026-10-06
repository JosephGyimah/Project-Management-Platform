import test from 'node:test';
import assert from 'node:assert/strict';
import { api } from './api.js';

test('frontend API client sends pagination and filter parameters', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input) => {
    const url = String(input);
    assert.ok(url.includes('/api/projects'));
    assert.ok(url.includes('search=roadmap'));
    assert.ok(url.includes('status=active'));
    assert.ok(url.includes('page=2'));
    assert.ok(url.includes('pageSize=5'));

    return new Response(
      JSON.stringify({
        data: [{ id: 'p1', name: 'Roadmap', status: 'active', ownerId: 'owner', createdAt: new Date().toISOString() }],
        pagination: { page: 2, pageSize: 5, total: 1, totalPages: 1 }
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }) as typeof fetch;

  const response = await api.listProjects({ search: 'roadmap', status: 'active', page: 2, pageSize: 5 });

  assert.equal(response.data.length, 1);
  assert.equal(response.pagination.page, 2);

  globalThis.fetch = originalFetch;
});

test('frontend API client propagates backend validation errors', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed.',
          issues: [{ field: 'name', message: 'Project name is required.' }]
        }
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )) as typeof fetch;

  await assert.rejects(
    async () => {
      await api.createProject({ name: '' });
    },
    (error: unknown) => {
      assert.equal((error as Error).message, 'Project name is required.');
      return true;
    }
  );

  globalThis.fetch = originalFetch;
});
