import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  ORGANIZATION,
  GitHubApiError,
  createGitHubClient,
  createSnapshot,
  fetchCommitStats,
  fetchRepositories,
  parseLinkHeader,
  updateProjects,
} from '../scripts/update-projects.mjs';

const now = '2026-09-15T00:00:00.000Z';
const oldTime = '2026-09-14T00:00:00.000Z';
const repository = (name = 'example') => ({
  name, private: false, description: 'A project', html_url: `https://github.com/${ORGANIZATION}/${name}`,
  homepage: '', language: 'JavaScript', stargazers_count: 5, forks_count: 2,
  archived: false, default_branch: 'main', pushed_at: '2026-09-15T05:00:00Z',
});
const commit = {
  html_url: `https://github.com/${ORGANIZATION}/example/commit/abc`,
  commit: { author: { date: '2026-08-01T00:00:00Z' }, committer: { date: '2026-09-10T12:00:00Z' } },
};
const result = (data, links = {}) => ({ data, links });

test('repository listing follows every page and includes only public repositories', async () => {
  const calls = [];
  const client = { async get(url) {
    calls.push(url);
    return calls.length === 1
      ? result([repository('zeta'), { ...repository('secret'), private: true }], { next: 'https://api.github.com/orgs/test/repos?page=2' })
      : result([repository('.github'), repository('alpha')]);
  } };
  assert.deepEqual((await fetchRepositories(client)).map((repo) => repo.name), ['.github', 'alpha', 'zeta']);
  assert.equal(calls.length, 2);
  assert.equal(new URL(calls[0]).searchParams.get('type'), 'public');
  assert.equal(new URL(calls[0]).searchParams.get('per_page'), '100');
});

test('commit count uses the last one-item page and the committer date', async () => {
  let calls = 0;
  const client = { async get(url) {
    calls += 1;
    assert.equal(new URL(url).searchParams.get('sha'), 'release/next');
    assert.equal(new URL(url).searchParams.get('per_page'), '1');
    return result([commit], parseLinkHeader('<https://api.github.com/repos/org/repo/commits?per_page=1&page=2>; rel="next", <https://api.github.com/repos/org/repo/commits?per_page=1&page=427>; rel="last"'));
  } };
  assert.deepEqual(await fetchCommitStats(client, { ...repository(), default_branch: 'release/next' }), {
    commits: 427, last_commit_at: commit.commit.committer.date, last_commit_url: commit.html_url,
  });
  assert.equal(calls, 1);
});

test('single commit repositories need no pagination header', async () => {
  assert.equal((await fetchCommitStats({ get: async () => result([commit]) }, repository())).commits, 1);
});

test('commit count follows next links when GitHub omits last', async () => {
  let calls = 0;
  const client = { async get() {
    calls += 1;
    return result([commit], calls < 3 ? { next: `https://api.github.com/repos/org/repo/commits?per_page=1&page=${calls + 1}` } : {});
  } };
  assert.equal((await fetchCommitStats(client, repository())).commits, 3);
  assert.equal(calls, 3);
});

test('confirmed empty repositories have zero commits and no last commit', async () => {
  const empty = { commits: 0, last_commit_at: null, last_commit_url: null };
  assert.deepEqual(await fetchCommitStats({ get: async () => result([]) }, repository()), empty);
  assert.deepEqual(await fetchCommitStats({ get: async () => { throw new GitHubApiError('Git Repository is empty.', 409); } }, repository()), empty);
  await assert.rejects(fetchCommitStats({ get: async () => { throw new GitHubApiError('Another conflict', 409); } }, repository()), /Another conflict/);
});

test('failed commit requests retain prior stats while refreshing stars and forks', async () => {
  const previousSnapshot = {
    organization: ORGANIZATION,
    projects: [{ name: 'example', default_branch: 'main', commits: 99, last_commit_at: oldTime, last_commit_url: commit.html_url, stats_updated_at: oldTime }],
  };
  const client = { async get(url) {
    if (url.includes('/orgs/')) return result([repository(), repository('new')]);
    throw new GitHubApiError('GitHub API HTTP 503: unavailable', 503);
  } };
  const snapshot = await createSnapshot({ client, previousSnapshot, now });
  assert.equal(snapshot.updated_at, now);
  const [existing, fresh] = snapshot.projects;
  assert.equal(existing.commits, 99);
  assert.equal(existing.last_commit_at, oldTime);
  assert.equal(existing.stats_updated_at, oldTime);
  assert.equal(existing.stars, 5);
  assert.equal(existing.forks, 2);
  assert.match(existing.stats_error, /503/);
  assert.equal(fresh.commits, null);
  assert.equal(fresh.last_commit_at, null);
  assert.equal(fresh.stats_updated_at, null);
});

test('statistics from a different default branch are not labeled as current', async () => {
  const client = { async get(url) {
    if (url.includes('/orgs/')) return result([repository()]);
    throw new GitHubApiError('unavailable', 503);
  } };
  const snapshot = await createSnapshot({ client, now, previousSnapshot: {
    organization: ORGANIZATION,
    projects: [{ name: 'example', default_branch: 'old-branch', commits: 99, last_commit_at: oldTime }],
  } });
  assert.equal(snapshot.projects[0].commits, null);
});

test('a failed second listing page preserves the complete saved snapshot', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'project-stats-test-'));
  const outputPath = join(directory, 'projects.json');
  const saved = JSON.stringify({ organization: ORGANIZATION, updated_at: oldTime, projects: [] });
  await writeFile(outputPath, saved);
  try {
    let calls = 0;
    const client = { async get() {
      if (++calls === 1) return result([repository()], { next: 'https://api.github.com/orgs/test/repos?page=2' });
      throw new GitHubApiError('GitHub API HTTP 403: rate limit exceeded', 403);
    } };
    await assert.rejects(updateProjects({ outputPath, client, now }), /403/);
    assert.equal(await readFile(outputPath, 'utf8'), saved);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('API client retries temporary server failures and keeps token server-side', async () => {
  let calls = 0;
  const delays = [];
  const client = createGitHubClient({
    token: 'test-token', sleep: async (ms) => delays.push(ms),
    fetchImpl: async (url, options) => {
      calls += 1;
      assert.equal(options.headers.Authorization, 'Bearer test-token');
      assert.equal(options.redirect, 'error');
      return calls === 1
        ? new Response(JSON.stringify({ message: 'try later' }), { status: 503 })
        : new Response(JSON.stringify([]), { status: 200 });
    },
  });
  assert.deepEqual(await client.get('/orgs/test/repos'), result([]));
  assert.equal(calls, 2);
  assert.deepEqual(delays, [500]);
  await assert.rejects(client.get('https://example.com/repos'), /Unexpected GitHub API URL/);
  assert.equal(calls, 2);
});

test('API client aborts timed out requests with a useful error', async () => {
  const client = createGitHubClient({
    timeoutMs: 5, retries: 0,
    fetchImpl: async (url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }),
  });
  await assert.rejects(client.get('/orgs/test/repos'), /timed out after 5 ms/);
});
