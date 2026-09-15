import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homePage, privacyIndex, policyPage, projectSlug } from '../src/render.mjs';
import { renderPolicyMarkdown } from '../src/markdown.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function buildSite({ source = root, output = resolve(root, '_site') } = {}) {
  const snapshot = JSON.parse(await readFile(resolve(source, 'data/projects.json'), 'utf8'));
  const details = JSON.parse(await readFile(resolve(source, 'data/project-details.json'), 'utf8'));
  let fetchedPolicies = {};
  try {
    const policies = JSON.parse(await readFile(resolve(source, 'data/policies.json'), 'utf8'));
    if (policies.organization !== snapshot.organization || policies.branch !== 'main' || !policies.policies) throw new Error('Invalid policy snapshot.');
    fetchedPolicies = policies.policies;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!Array.isArray(snapshot.projects) || !snapshot.updated_at || !Number.isFinite(Date.parse(snapshot.updated_at))) throw new Error('Missing or invalid project snapshot. Run npm run update first.');
  const slugs = new Set();
  const projects = await Promise.all(snapshot.projects.map(async repo => {
    const extra = details[repo.name] || {};
    const project = { ...repo, ...extra, title: extra.title || repo.name, icon: extra.icon || 'code', slug: projectSlug(repo.name) };
    if (slugs.has(project.slug)) throw new Error(`Duplicate project path: ${project.slug}`);
    slugs.add(project.slug);
    let policy = '';
    try {
      policy = (await readFile(resolve(source, 'policies', `${repo.name}.html`), 'utf8')).replace(/<!--[\s\S]*?-->/g, '').trim();
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const fetched = Object.hasOwn(fetchedPolicies, repo.name) ? fetchedPolicies[repo.name] : null;
    if (fetched?.markdown) policy = renderPolicyMarkdown(fetched.markdown, fetched.source_url);
    project.policy = policy;
    project.policyPublished = Boolean(policy.trim());
    return project;
  }));
  projects.sort((a, b) => (Date.parse(b.last_commit_at) || 0) - (Date.parse(a.last_commit_at) || 0) || a.title.localeCompare(b.title));
  await rm(output, { recursive: true, force: true });
  await mkdir(resolve(output, 'assets'), { recursive: true });
  await mkdir(resolve(output, 'privacy'), { recursive: true });
  await Promise.all(['styles.css', 'app.js', 'theme.js', 'logo.jpg', 'logo.png'].map(file => cp(resolve(source, 'src', file), resolve(output, 'assets', file))));
  await writeFile(resolve(output, '.nojekyll'), '');
  await writeFile(resolve(output, 'index.html'), homePage(snapshot, projects));
  await writeFile(resolve(output, 'privacy/index.html'), privacyIndex(projects));
  for (const project of projects) {
    const directory = resolve(output, 'privacy', project.slug);
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(directory, 'index.html'), policyPage(project, project.policy));
  }
  console.log(`Built ${projects.length} projects and ${projects.length} policy pages in ${output}`);
  return projects;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  buildSite().catch(error => { console.error(error.message); process.exitCode = 1; });
}
