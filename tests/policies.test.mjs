import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fetchPolicy, findPolicyFiles, updatePolicies } from '../scripts/update-policies.mjs';
import { GitHubApiError } from '../scripts/update-projects.mjs';
import { renderPolicyMarkdown } from '../src/markdown.mjs';

const sha = 'a'.repeat(40);
const file = path => ({ type: 'blob', mode: '100644', path, sha });
const blob = markdown => ({ data: { encoding: 'base64', size: Buffer.byteLength(markdown), content: Buffer.from(markdown).toString('base64') } });

test('policy discovery is case-insensitive, checks nested files, and ignores unrelated files', () => {
  const found = findPolicyFiles(['src/constants/privacy.ts', 'node_modules/pkg/PRIVACY.md', 'docs/privacy-policy.md', 'PRIVACY.md', 'Privacy_Policy.markdown', 'README.md'].map(file));
  assert.deepEqual(found.map(f => f.path), ['PRIVACY.md', 'Privacy_Policy.markdown', 'docs/privacy-policy.md']);
});

test('fetches main explicitly and reads the discovered immutable blob', async () => {
  const calls = [];
  const policy = await fetchPolicy({ get: async path => {
    calls.push(path);
    return path.includes('/git/trees/') ? { data: { tree: [file('store-listing/privacy-policy.md')], truncated: false } } : blob('# Policy\n\nCurrent text.');
  } }, 'Example');
  assert.match(calls[0], /git\/trees\/main\?recursive=1$/);
  assert.match(calls[1], new RegExp(`/git/blobs/${sha}$`));
  assert.equal(policy.markdown, '# Policy\n\nCurrent text.');
  assert.match(policy.source_url, /blob\/main\/store-listing\/privacy-policy\.md$/);
});

test('empty/comment-only files do not count as policies', async () => {
  assert.equal(await fetchPolicy({ get: async path => path.includes('/git/trees/') ? { data: { tree: [file('PRIVACY.md')] } } : blob('<!-- Add a policy -->\n') }, 'Empty'), null);
});

test('missing main and confirmed empty repositories do not produce policies', async () => {
  for (const error of [new GitHubApiError('Not Found', 404), new GitHubApiError('Git Repository is empty.', 409)]) {
    assert.equal(await fetchPolicy({ get: async () => { throw error; } }, 'Missing'), null);
  }
});

test('rate limits and truncated trees fail instead of silently removing policies', async () => {
  await assert.rejects(fetchPolicy({ get: async () => { throw new GitHubApiError('rate limit exceeded', 403); } }, 'App'), /rate limit/);
  await assert.rejects(fetchPolicy({ get: async () => ({ data: { tree: [], truncated: true } }) }, 'App'), /incomplete repository tree/);
});

test('sync discovers new policies, updates contents, and removes policies deleted from main', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'policy-refresh-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const projectsPath = join(directory, 'projects.json');
  const outputPath = join(directory, 'policies.json');
  await writeFile(projectsPath, JSON.stringify({ organization: 'Marginally-Better-Apps', projects: [{ name: 'App' }] }));
  let text = 'First policy';
  const client = { get: async path => path.includes('/git/trees/') ? { data: { tree: text ? [file('PRIVACY.md')] : [] } } : blob(text) };
  let result = await updatePolicies({ client, projectsPath, outputPath });
  assert.equal(result.policies.App.markdown, 'First policy');
  text = 'Updated policy';
  result = await updatePolicies({ client, projectsPath, outputPath });
  assert.equal(result.policies.App.markdown, 'Updated policy');
  const saved = await readFile(outputPath, 'utf8');
  await assert.rejects(updatePolicies({ client: { get: async () => { throw new Error('Network failure'); } }, projectsPath, outputPath }));
  assert.equal(await readFile(outputPath, 'utf8'), saved);
  text = '';
  result = await updatePolicies({ client, projectsPath, outputPath });
  assert.deepEqual(result.policies, {});
});

test('Markdown formatting is preserved without executable HTML or unsafe links', () => {
  const html = renderPolicyMarkdown('# Privacy\n\n**Bold** and `code`.\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n[Contact](../CONTACT.md)\n\n![tracker](https://example.org/pixel.png)', 'https://github.com/org/app/blob/main/docs/privacy.md');
  assert.match(html, /<h2>Privacy<\/h2>/);
  assert.match(html, /<strong>Bold<\/strong>/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /href="https:\/\/github.com\/org\/app\/blob\/main\/CONTACT.md"/);
  assert.doesNotMatch(html, /<script>|href="javascript:|<img /);
});
