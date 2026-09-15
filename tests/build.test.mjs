import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { buildSite } from '../scripts/build.mjs';
import { escapeHTML, projectSlug } from '../src/render.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const updatedAt = '2026-09-15T02:00:00.000Z';
const repository = (name, extra = {}) => ({
  name,
  description: 'A small useful project.',
  url: `https://github.com/Marginally-Better-Apps/${name}`,
  homepage: null,
  language: 'JavaScript',
  stars: 7,
  forks: 2,
  archived: false,
  default_branch: 'main',
  commits: 123,
  last_commit_at: '2026-09-12T12:34:56Z',
  last_commit_url: `https://github.com/Marginally-Better-Apps/${name}/commit/abc`,
  stats_updated_at: updatedAt,
  ...extra,
});

async function temporaryDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), 'marginally-better-build-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function fixture(t, { projects, details = {}, policies = {}, fetchedPolicies = {} }) {
  const directory = await temporaryDirectory(t);
  const source = join(directory, 'source');
  const output = join(directory, 'output');
  await Promise.all(['data', 'src', 'policies'].map(path => mkdir(join(source, path), { recursive: true })));
  await Promise.all([
    writeFile(join(source, 'data/projects.json'), JSON.stringify({ organization: 'Marginally-Better-Apps', updated_at: updatedAt, projects })),
    writeFile(join(source, 'data/project-details.json'), JSON.stringify(details)),
    writeFile(join(source, 'data/policies.json'), JSON.stringify({ organization: 'Marginally-Better-Apps', branch: 'main', policies: fetchedPolicies })),
    ...['app.js', 'theme.js', 'styles.css', 'logo.jpg', 'logo.png'].map(file => writeFile(join(source, 'src', file), '')),
    ...Object.entries(policies).map(([name, content]) => writeFile(join(source, 'policies', `${name}.html`), content)),
  ]);
  const built = await buildSite({ source, output });
  return { source, output, projects: built, home: await readFile(join(output, 'index.html'), 'utf8') };
}

test('the current snapshot renders every project and policy page without running JavaScript', async t => {
  const output = join(await temporaryDirectory(t), 'site');
  const snapshot = JSON.parse(await readFile(join(root, 'data/projects.json'), 'utf8'));
  const projects = await buildSite({ source: root, output });
  const home = await readFile(join(output, 'index.html'), 'utf8');
  assert.equal(projects.length, snapshot.projects.length);
  assert.equal((home.match(/data-project data-name=/g) || []).length, snapshot.projects.length);
  for (const project of projects) {
    assert.ok(home.includes(`data-name="${escapeHTML(project.title)}"`), `${project.name} has a static row`);
    assert.ok(home.includes(`href="./privacy/${project.slug}/"`), `${project.name} links to its policy`);
    const page = await readFile(join(output, 'privacy', project.slug, 'index.html'), 'utf8');
    assert.ok(page.includes(`<h1>${escapeHTML(project.title)}</h1>`));
    if (project.last_commit_at) assert.ok(home.includes(`datetime="${new Date(project.last_commit_at).toISOString()}"`));
  }
  assert.ok(home.includes('No commits yet'), 'the empty Pages repository is represented accurately');
  assert.ok(home.includes('data-project-controls hidden'), 'controls are hidden until JavaScript is available');
  assert.doesNotMatch(await readFile(join(output, 'assets/app.js'), 'utf8'), /\bfetch\s*\(|XMLHttpRequest|api\.github\.com/);
  await access(join(output, '.nojekyll'));
});

test('authored local policy content remains available when no repository Markdown exists', async t => {
  const { output, projects } = await fixture(t, {
    projects: [repository('With-Policy')],
    details: { 'With-Policy': { title: 'With Policy', privacy_url: 'https://github.com/example/old-policy' } },
    policies: { 'With-Policy': '<!-- Author guidance --><h2>Our privacy policy</h2><p>Published policy content.</p>' },
  });
  const page = await readFile(join(output, 'privacy/with-policy/index.html'), 'utf8');
  assert.ok(page.includes('<h2>Our privacy policy</h2><p>Published policy content.</p>'));
  assert.doesNotMatch(page, /Author guidance|old-policy|Read the current policy|Policy not yet published/);
  assert.equal(projects[0].policyPublished, true);
  assert.match(await readFile(join(output, 'privacy/index.html'), 'utf8'), /Read policy/);
});

test('fetched Markdown is displayed locally and overrides old local content', async t => {
  const external = 'https://github.com/example/app/blob/main/PRIVACY.md';
  const { output, projects } = await fixture(t, {
    projects: [repository('External')],
    policies: { External: '<p>Old local text</p>' },
    fetchedPolicies: { External: { source_url: external, markdown: '# Privacy\n\nUpdated **policy content**.\n\n- First item\n- Second item' } },
  });
  const page = await readFile(join(output, 'privacy/external/index.html'), 'utf8');
  assert.match(page, /<strong>policy content<\/strong>/);
  assert.match(page, /<li>First item<\/li>/);
  assert.doesNotMatch(page, /Policy not yet published|Read privacy policy on GitHub|Old local text/);
  assert.equal(projects[0].policyPublished, true);
});

test('projects without approved policy content stay explicitly unpublished', async t => {
  const { output, projects } = await fixture(t, {
    projects: [repository('Missing'), repository('Unsafe-Link')],
    details: { 'Unsafe-Link': { privacy_url: 'javascript:alert(1)' } },
  });
  for (const project of projects) {
    const page = await readFile(join(output, 'privacy', project.slug, 'index.html'), 'utf8');
    assert.match(page, /Policy not yet published/);
    assert.doesNotMatch(page, /javascript:|Read the current policy/);
    assert.equal(project.policyPublished, false);
  }
  const directory = await readFile(join(output, 'privacy/index.html'), 'utf8');
  assert.doesNotMatch(directory, /class="policy-entry"|Not yet published/);
  assert.match(directory, /No privacy policies have been published yet/);
});

test('untrusted display metadata stays text and unsafe links cannot execute', async t => {
  const injection = '"><img src=x onerror=alert(1)><script>alert(2)</script>&';
  const { home, output } = await fixture(t, {
    projects: [repository('Escape-Me', {
      description: injection,
      language: injection,
      homepage: 'javascript:alert(3)',
      last_commit_url: 'javascript:alert(4)',
    })],
    details: { 'Escape-Me': { title: injection, icon: injection, privacy_url: 'data:text/html,<script>alert(5)</script>' } },
    policies: { 'Escape-Me': '<p>Published policy</p>' },
  });
  const pages = [
    { html: home, base: './' },
    { html: await readFile(join(output, 'privacy/index.html'), 'utf8'), base: '../' },
    { html: await readFile(join(output, 'privacy/escape-me/index.html'), 'utf8'), base: '../../' },
  ];
  for (const { html, base } of pages) {
    assert.ok(html.includes(escapeHTML(injection)));
    // The shared header intentionally contains one image. Only that exact tag
    // is allowed; injected images or extra attributes must still fail the test.
    const logo = `<img class="brand-mark" src="${base}assets/logo.png" alt="" width="34" height="34">`;
    assert.ok(html.includes(logo), 'the trusted header logo is present');
    assert.doesNotMatch(html.replace(logo, ''), /<img\b|<script>alert|href="(?:javascript:|data:)/i);
  }
  assert.ok(home.includes('/commits/main'), 'unsafe last-commit URL falls back to the repository history');
});

test('unexpected string statistics cannot break out of a data attribute', async t => {
  const { home } = await fixture(t, {
    projects: [repository('Invalid-Statistic', { stars: '7" onmouseover="alert(1)' })],
  });
  assert.doesNotMatch(home, /data-stars="7" onmouseover=/);
  assert.doesNotMatch(home, /\sonmouseover="/);
});

test('all internal links and assets resolve within a GitHub Pages project subpath', async t => {
  const { output, projects } = await fixture(t, { projects: [repository('.github'), repository('Future-Project')] });
  const prefix = '/Marginally-Better.github.io/';
  const pages = ['index.html', 'privacy/index.html', ...projects.map(project => `privacy/${project.slug}/index.html`)];
  for (const page of pages) {
    const html = await readFile(join(output, page), 'utf8');
    const pageURL = new URL(page.replace(/index\.html$/, ''), `https://marginally-better-apps.github.io${prefix}`);
    for (const [, attribute] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const target = new URL(attribute.replace(/&amp;/g, '&'), pageURL);
      if (target.origin !== pageURL.origin) continue;
      assert.ok(target.pathname.startsWith(prefix), `${page}: ${attribute} stays under the project path`);
      const relative = decodeURIComponent(target.pathname.slice(prefix.length));
      const file = relative.endsWith('/') || relative === '' ? `${relative}index.html` : relative;
      await assert.doesNotReject(access(join(output, file)), `${page}: ${attribute} resolves to a generated file`);
    }
  }
});

test('leading-dot repositories get visible policy paths without colliding with ordinary names', async t => {
  const names = ['.github', 'github', '.another-project', 'another-project'];
  const { output, projects, home } = await fixture(t, { projects: names.map(name => repository(name)) });
  assert.equal(projects.length, names.length);
  assert.equal(new Set(projects.map(project => project.slug)).size, names.length);
  for (const project of projects) {
    const expected = `${project.name.startsWith('.') ? '~' : ''}${project.name.toLowerCase()}`;
    assert.equal(project.slug, expected);
    assert.ok(!project.slug.startsWith('.'), `${project.name} avoids hidden artifact directories`);
    assert.ok(home.includes(`href="./privacy/${expected}/"`));
    await access(join(output, 'privacy', expected, 'index.html'));
  }
  assert.throws(() => projectSlug('~.github'), /Invalid repository name/, 'a real repository cannot collide with the reserved prefix');
});

test('a new repository gets a static row and policy page without a metadata entry', async t => {
  const { projects, home, output } = await fixture(t, { projects: [repository('A-New.Future_Project')] });
  assert.equal(projects[0].title, 'A-New.Future_Project');
  assert.equal(projects[0].slug, 'a-new.future_project');
  assert.ok(home.includes('data-name="A-New.Future_Project"'));
  assert.ok(home.includes('href="./privacy/a-new.future_project/"'));
  assert.match(await readFile(join(output, 'privacy/a-new.future_project/index.html'), 'utf8'), /Policy not yet published/);
});

test('stale commit values remain visible and unknown values never appear as zero', async t => {
  const { home } = await fixture(t, { projects: [
    repository('Cached', { commits: 321, stats_updated_at: '2026-09-10T00:00:00Z', stats_error: 'GitHub API HTTP 503' }),
    repository('Unknown', { commits: null, last_commit_at: null, last_commit_url: null, stats_updated_at: null, stats_error: 'GitHub API HTTP 503' }),
  ] });
  const rows = [...home.matchAll(/<li class="project-row"[\s\S]*?<\/li>/g)].map(match => match[0]);
  const cached = rows.find(row => row.includes('data-name="Cached"'));
  const unknown = rows.find(row => row.includes('data-name="Unknown"'));
  assert.match(cached, />321<span class="stale-mark"/);
  assert.match(cached, /Last checked 2026-09-10T00:00:00Z/);
  assert.match(unknown, /unavailable commits/);
  assert.match(unknown, />—<span class="stale-mark"/);
  assert.match(unknown, /<span>Unavailable<\/span>/);
  assert.doesNotMatch(unknown, /No commits yet/);
  assert.match(home, /Some commit stats could not be refreshed/);
});
