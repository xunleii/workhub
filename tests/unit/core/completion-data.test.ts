import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.doUnmock('../../../src/core/config.js');
  vi.doUnmock('../../../src/core/git.js');
  vi.doUnmock('../../../src/core/workspace.js');
});

describe('src/core/completion-data', () => {
  it('prefers unique basenames and keeps full names for ambiguous repositories', async () => {
    const { buildRepositoryCompletionValues } = await import('../../../src/core/completion-data.js');

    expect(buildRepositoryCompletionValues([
      'gitlab/team-a/api',
      'gitlab/team-b/api',
      'gitlab/team-a/web',
    ])).toEqual([
      'gitlab/team-a/api',
      'gitlab/team-b/api',
      'web',
    ]);
  });

  it('lists repository completion values from scanned origins', async () => {
    vi.doMock('../../../src/core/config.js', () => ({
      getActiveConfig: vi.fn(() => ({ origins: '/tmp/origins', editor: 'zed' })),
    }));

    vi.doMock('../../../src/core/git.js', () => ({
      scanOrigins: vi.fn(async () => [
        { name: 'gitlab/team-a/api', path: '/tmp/origins/gitlab/team-a/api' },
        { name: 'gitlab/team-a/web', path: '/tmp/origins/gitlab/team-a/web' },
      ]),
    }));

    vi.doMock('../../../src/core/workspace.js', () => ({
      listWorkspaces: vi.fn(),
      loadWorkspace: vi.fn(),
    }));

    const { listCompletionValues } = await import('../../../src/core/completion-data.js');

    await expect(listCompletionValues('repos')).resolves.toEqual(['api', 'web']);
  });

  it('lists workspace repositories exactly as stored in the manifest', async () => {
    vi.doMock('../../../src/core/config.js', () => ({
      getActiveConfig: vi.fn(),
    }));

    vi.doMock('../../../src/core/git.js', () => ({
      scanOrigins: vi.fn(),
    }));

    vi.doMock('../../../src/core/workspace.js', () => ({
      listWorkspaces: vi.fn(async () => ['ticket-1234']),
      loadWorkspace: vi.fn(async () => ({
        name: 'ticket-1234',
        branch: 'feature/x',
        created_at: '2026-04-28T00:00:00.000Z',
        paths: [
          { repo: 'gitlab/team-a/api', path: '/tmp/api' },
          { repo: 'gitlab/team-a/web', path: '/tmp/web' },
        ],
      })),
    }));

    const { listCompletionValues } = await import('../../../src/core/completion-data.js');

    await expect(listCompletionValues('workspace-repos', 'ticket-1234')).resolves.toEqual([
      'gitlab/team-a/api',
      'gitlab/team-a/web',
    ]);
  });
});
