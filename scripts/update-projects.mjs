import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ORGANIZATION = 'Marginally-Better-Apps';
const API_ORIGIN = 'https://api.github.com';
const DEFAULT_OUTPUT = fileURLToPath(new URL('../data/projects.json', import.meta.url));

export class GitHubApiError extends Error {
  constructor(message, status = null) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
  }
}

export function parseLinkHeader(header = '') {
  const links = {};
  for (const match of (header ?? '').matchAll(/<([^>]+)>\s*;\s*rel="([^"]+)"/g)) {
    for (const relation of match[2].split(/\s+/)) links[relation] = match[1];
  }
  return links;
}

/** Fetches public GitHub data; the token stays in this build-time process. */
export function createGitHubClient({
  fetchImpl = globalThis.fetch,
  token = process.env.GITHUB_TOKEN,
  timeoutMs = 15_000,
  retries = 2,
  sleep = (ms) => new Promise((done) => setTimeout(done, ms)),
} = {}) {
  return {
    async get(input) {
      const url = new URL(input, API_ORIGIN);
      // Never forward a credential to another host via a pagination URL.
      if (url.origin !== API_ORIGIN) throw new Error('Unexpected GitHub API URL.');
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        let retry = false;
        try {
          const response = await fetchImpl(url.href, {
            headers: {
              Accept: 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
              'User-Agent': 'Marginally-Better-Apps-projects',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            signal: controller.signal,
            redirect: 'error',
          });
          let body;
          try {
            body = await response.json();
          } catch {
            throw new GitHubApiError(`GitHub returned an invalid JSON response (HTTP ${response.status}).`, response.status);
          }
          if (!response.ok) {
            const detail = typeof body?.message === 'string' ? body.message.slice(0, 200) : response.statusText;
            throw new GitHubApiError(`GitHub API HTTP ${response.status}: ${detail}`, response.status);
          }
          return { data: body, links: parseLinkHeader(response.headers.get('link')) };
        } catch (error) {
          const status = error instanceof GitHubApiError ? error.status : null;
          retry = attempt < retries && (status === null || status === 429 || status >= 500);
          if (!retry) {
            if (controller.signal.aborted) throw new GitHubApiError(`GitHub API request timed out after ${timeoutMs} ms.`);
            throw error;
          }
        } finally {
          clearTimeout(timeout);
        }
        if (retry) await sleep(500 * 2 ** attempt);
      }
      throw new Error('GitHub API request failed.');
    },
  };
}

export async function fetchRepositories(client, organization = ORGANIZATION) {
  let next = `${API_ORIGIN}/orgs/${encodeURIComponent(organization)}/repos?type=public&per_page=100&sort=full_name&direction=asc`;
  const seenPages = new Set();
  const repositories = new Map();
  while (next) {
    if (seenPages.has(next)) throw new Error('GitHub repository pagination repeated a page.');
    seenPages.add(next);
    const { data, links } = await client.get(next);
    if (!Array.isArray(data)) throw new Error('GitHub returned an invalid repository list.');
    for (const repository of data) {
      // Defensive filtering also protects snapshots made with a privileged token.
      if (repository.private !== false) continue;
      if (typeof repository.name !== 'string' || !repository.name) throw new Error('GitHub returned a repository without a name.');
      repositories.set(repository.name.toLowerCase(), repository);
    }
    next = links.next;
  }
  return [...repositories.values()].sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

/** Counts commits reachable from the default branch, including merge commits. */
export async function fetchCommitStats(client, repository, organization = ORGANIZATION) {
  const url = new URL(`${API_ORIGIN}/repos/${encodeURIComponent(organization)}/${encodeURIComponent(repository.name)}/commits`);
  url.searchParams.set('per_page', '1');
  if (repository.default_branch) url.searchParams.set('sha', repository.default_branch);
  let first;
  try {
    first = await client.get(url.href);
  } catch (error) {
    // A 409 can also mean a different conflict; only a confirmed empty repo is zero.
    if (error instanceof GitHubApiError && error.status === 409 && /repository is empty/i.test(error.message)) {
      return { commits: 0, last_commit_at: null, last_commit_url: null };
    }
    throw error;
  }
  if (!Array.isArray(first.data) || first.data.length > 1) throw new Error('GitHub returned an invalid commit list.');
  if (first.data.length === 0) return { commits: 0, last_commit_at: null, last_commit_url: null };

  let commits = 1;
  let countFromLastPage = false;
  if (first.links.last) {
    const last = new URL(first.links.last);
    const page = Number(last.searchParams.get('page'));
    if (last.origin === API_ORIGIN && last.searchParams.get('per_page') === '1' && Number.isSafeInteger(page) && page > 0) {
      commits = page;
      countFromLastPage = true;
    }
  }
  // GitHub normally provides `last`. Follow `next` if it does not, keeping the
  // count exact instead of presenting one commit as the total.
  if (!countFromLastPage) {
    const seenPages = new Set([url.href]);
    let next = first.links.next;
    while (next) {
      if (seenPages.has(next)) throw new Error('GitHub commit pagination repeated a page.');
      seenPages.add(next);
      const page = await client.get(next);
      if (!Array.isArray(page.data)) throw new Error('GitHub returned an invalid commit list.');
      commits += page.data.length;
      next = page.links.next;
    }
  }
  const latest = first.data[0];
  const committedAt = latest.commit?.committer?.date;
  if (typeof committedAt !== 'string' || !Number.isFinite(Date.parse(committedAt))) {
    throw new Error('GitHub returned a commit without a valid committer timestamp.');
  }
  return {
    commits,
    last_commit_at: committedAt,
    last_commit_url: typeof latest.html_url === 'string' ? latest.html_url : null,
  };
}

export async function createSnapshot({
  client = createGitHubClient(),
  organization = ORGANIZATION,
  previousSnapshot = null,
  now = new Date().toISOString(),
} = {}) {
  const repositories = await fetchRepositories(client, organization);
  const previous = new Map(
    previousSnapshot?.organization === organization && Array.isArray(previousSnapshot.projects)
      ? previousSnapshot.projects.map((project) => [project.name.toLowerCase(), project])
      : [],
  );
  const projects = [];
  // Modest parallelism keeps large organizations quick without flooding GitHub.
  for (let offset = 0; offset < repositories.length; offset += 4) {
    projects.push(...await Promise.all(repositories.slice(offset, offset + 4).map(async (repository) => {
      const project = {
        name: repository.name,
        description: repository.description ?? '',
        url: repository.html_url,
        homepage: repository.homepage || null,
        language: repository.language ?? null,
        stars: repository.stargazers_count,
        forks: repository.forks_count,
        archived: repository.archived === true,
        default_branch: repository.default_branch ?? null,
      };
      try {
        return { ...project, ...await fetchCommitStats(client, repository, organization), stats_updated_at: now };
      } catch (error) {
        const old = previous.get(repository.name.toLowerCase());
        const usable = old?.default_branch === project.default_branch ? old : null;
        return {
          ...project,
          commits: Number.isSafeInteger(usable?.commits) && usable.commits >= 0 ? usable.commits : null,
          last_commit_at: usable?.last_commit_at ?? null,
          last_commit_url: usable?.last_commit_url ?? null,
          stats_updated_at: usable?.stats_updated_at ?? null,
          stats_error: error instanceof Error ? error.message.slice(0, 300) : 'Commit statistics are temporarily unavailable.',
        };
      }
    })));
  }
  return { organization, updated_at: now, projects };
}

export async function updateProjects({ outputPath = DEFAULT_OUTPUT, ...options } = {}) {
  let previousSnapshot = null;
  try {
    previousSnapshot = JSON.parse(await readFile(outputPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  // A failed/incomplete repository listing never replaces the previous snapshot.
  const snapshot = await createSnapshot({ ...options, previousSnapshot });
  await mkdir(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`);
    await rename(temporaryPath, outputPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
  return snapshot;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  updateProjects().then((snapshot) => {
    const unavailable = snapshot.projects.filter((project) => project.stats_error);
    console.log(`Updated ${snapshot.projects.length} public repositories for ${snapshot.organization}.`);
    for (const project of unavailable) console.warn(`${project.name}: ${project.stats_error} Retained prior commit statistics where available.`);
  }).catch((error) => {
    console.error(`Project data update failed: ${error.message}`);
    process.exitCode = 1;
  });
}
