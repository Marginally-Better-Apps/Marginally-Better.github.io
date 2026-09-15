import { readFile, writeFile, rename, rm, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createGitHubClient, GitHubApiError, ORGANIZATION } from './update-projects.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const policyName = /^privacy(?:[-_ ]?policy)?\.(?:md|markdown)$/i;
const ignoredDirectory = /(?:^|\/)(?:node_modules|vendor|\.git|\.build|Pods)(?:\/|$)/i;

export function findPolicyFiles(tree) {
  return tree.filter(file => file.type === 'blob' && file.mode !== '120000' &&
    !ignoredDirectory.test(file.path) && policyName.test(file.path.split('/').at(-1)))
    .sort((a, b) => a.path.split('/').length - b.path.split('/').length ||
      Number(b.path.split('/').at(-1).toLowerCase() === 'privacy.md') - Number(a.path.split('/').at(-1).toLowerCase() === 'privacy.md') ||
      a.path.localeCompare(b.path, 'en'));
}

export function cleanMarkdown(markdown) {
  return markdown.replace(/^\uFEFF/, '').replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '').replace(/<!--[\s\S]*?-->/g, '').trim();
}

export async function fetchPolicy(client, name, organization = ORGANIZATION) {
  const repository = `/repos/${encodeURIComponent(organization)}/${encodeURIComponent(name)}`;
  let tree;
  try {
    ({ data: tree } = await client.get(`${repository}/git/trees/main?recursive=1`));
  } catch (error) {
    // No main branch (including empty repositories) means no policy on main.
    if (error instanceof GitHubApiError && (error.status === 404 ||
      (error.status === 409 && /(?:repository|git repository) is empty/i.test(error.message)))) return null;
    throw error;
  }
  if (!Array.isArray(tree.tree) || tree.truncated) throw new Error(`${name}: incomplete repository tree; preserving the previous policy snapshot.`);
  for (const file of findPolicyFiles(tree.tree)) {
    if (!/^[a-f0-9]{40,64}$/i.test(file.sha)) throw new Error(`${name}: invalid policy blob SHA.`);
    const { data } = await client.get(`${repository}/git/blobs/${file.sha}`);
    if (data.encoding !== 'base64' || typeof data.content !== 'string' || data.size > 1_000_000) {
      throw new Error(`${name}: invalid or oversized privacy policy.`);
    }
    const markdown = Buffer.from(data.content, 'base64').toString('utf8');
    if (!cleanMarkdown(markdown)) continue;
    return {
      path: file.path,
      sha: file.sha,
      source_url: `https://github.com/${organization}/${encodeURIComponent(name)}/blob/main/${file.path.split('/').map(encodeURIComponent).join('/')}`,
      markdown,
    };
  }
  return null;
}

export async function updatePolicies({
  client = createGitHubClient(),
  projectsPath = resolve(root, 'data/projects.json'),
  outputPath = resolve(root, 'data/policies.json'),
  now = new Date().toISOString(),
} = {}) {
  const projects = JSON.parse(await readFile(projectsPath, 'utf8'));
  if (projects.organization !== ORGANIZATION || !Array.isArray(projects.projects)) throw new Error('Invalid public project snapshot.');
  const entries = [];
  for (let offset = 0; offset < projects.projects.length; offset += 4) {
    entries.push(...await Promise.all(projects.projects.slice(offset, offset + 4).map(async project => {
      const policy = await fetchPolicy(client, project.name);
      return [project.name, policy];
    })));
  }
  // Replace only after every repository has been checked. A network/rate-limit
  // failure stops deployment, so published policies cannot disappear by accident.
  const snapshot = { organization: ORGANIZATION, branch: 'main', updated_at: now, policies: Object.fromEntries(entries.filter(([, policy]) => policy)) };
  await mkdir(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`);
    await rename(temporaryPath, outputPath);
  } finally { await rm(temporaryPath, { force: true }); }
  return snapshot;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  updatePolicies().then(snapshot => {
    console.log(`Fetched ${Object.keys(snapshot.policies).length} privacy policies from main.`);
  }).catch(error => { console.error(`Policy update failed: ${error.message}`); process.exitCode = 1; });
}
