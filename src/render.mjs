export const ORGANIZATION = 'Marginally-Better-Apps';
export const ORG_URL = `https://github.com/${ORGANIZATION}`;

export function escapeHTML(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

export function safeURL(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? escapeHTML(url.href) : '';
  } catch { return ''; }
}

// Pages' upload action excludes dot-directories. A '~' prefix keeps their
// policies in the artifact and cannot collide with an allowed repository name.
export function projectSlug(name) {
  if (!/^[a-zA-Z0-9_.-]+$/.test(name) || /^\.+$/.test(name)) throw new Error(`Invalid repository name: ${name}`);
  return `${name.startsWith('.') ? '~' : ''}${name.toLowerCase()}`;
}

const paths = {
  moon: '<path d="M20.5 13.1A8.5 8.5 0 0 1 10.9 3.5a8.5 8.5 0 1 0 9.6 9.6Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  external: '<path d="M7 17 17 7M7 7h10v10"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  star: '<path d="m12 3 2.8 5.7 6.3.9-4.5 4.4 1.1 6.2-5.7-3-5.7 3 1.1-6.2-4.5-4.4 6.3-.9Z"/>',
  fork: '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="5" r="2"/><circle cx="12" cy="19" r="2"/><path d="M6 7v3a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7m-6 6v4"/>',
  commit: '<circle cx="12" cy="12" r="4"/><path d="M2 12h6m8 0h6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  shield: '<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
  qr: '<path d="M3 3h6v6H3zm12 0h6v6h-6zM3 15h6v6H3zm12 0h2v2h4v4h-6zm6-3v2M12 3v8H3m9 4v6"/>',
  music: '<path d="M9 18V6l11-3v12M9 9l11-3"/><ellipse cx="6" cy="18" rx="3" ry="2.5"/><ellipse cx="17" cy="15" rx="3" ry="2.5"/>',
  wave: '<path d="M3 10v4m4-8v12m5-16v20m5-16v12m4-8v4"/>',
  metronome: '<path d="m10 3-6 18h16L14 3Zm-3 12h10m-5-2 5-7"/>',
  arrows: '<path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4"/>',
  scan: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M7 8h10M7 12h10m-10 4h6"/>',
  photo: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6"/>',
  code: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-14-2 16"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  github: '<path d="M9 19c-4 1-4-2-6-2m12 5v-3.9c0-1.1-.4-1.8-.8-2.2 2.7-.3 5.5-1.3 5.5-6a4.7 4.7 0 0 0-1.3-3.2c.1-.3.6-1.6-.1-3.3 0 0-1-.3-3.4 1.3a11.8 11.8 0 0 0-6.2 0C6.3 3.1 5.3 3.4 5.3 3.4c-.7 1.7-.2 3-.1 3.3A4.7 4.7 0 0 0 4 9.9c0 4.7 2.8 5.7 5.5 6-.4.4-.8 1.1-.8 2.2V22"/>'
};

export function icon(name) {
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.code}</svg>`;
}

const number = value => Number.isFinite(value) ? new Intl.NumberFormat('en-US').format(value) : '—';

export function timeTag(value, relative = true) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Unavailable';
  const date = new Date(value);
  const exact = date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'long', timeZone: 'UTC' });
  const short = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  return `<time datetime="${escapeHTML(date.toISOString())}" title="${escapeHTML(exact)}" aria-label="${escapeHTML(exact)}"${relative ? ' data-relative' : ''}>${short}</time>`;
}

function footer(base) {
  return `<footer class="site-footer"><span>Marginally Better</span><div class="footer-links"><a href="${base}privacy/">Privacy policies</a><a href="${ORG_URL}">GitHub ${icon('external')}</a></div></footer>`;
}

export function layout({ title, description, body, base = './', page = 'projects' }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#fcfbf8">
  <title>${escapeHTML(title)}</title>
  <meta name="description" content="${escapeHTML(description)}">
  <meta property="og:title" content="${escapeHTML(title)}">
  <meta property="og:description" content="${escapeHTML(description)}">
  <meta property="og:type" content="website">
  <link rel="icon" href="${base}assets/favicon.svg" type="image/svg+xml">
  <script src="${base}assets/theme.js"></script>
  <link rel="stylesheet" href="${base}assets/styles.css">
  <script src="${base}assets/app.js" defer></script>
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <div class="container">
    <header class="site-header">
      <a class="brand" href="${base}" aria-label="Marginally Better home"><span class="brand-mark"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3.5"><path d="M5 19v-6m7 6V8m7 11V3"/></svg></span>Marginally Better.</a>
      <nav class="site-nav" aria-label="Main navigation">
        <a href="${base}#projects"${page === 'projects' ? ' class="current"' : ''}>Projects</a>
        <a href="${base}privacy/"${page === 'privacy' ? ' class="current" aria-current="page"' : ''}>Privacy</a>
        <a class="github-link" href="${ORG_URL}" aria-label="Marginally Better on GitHub"><span class="github-label">GitHub</span>${icon('github')}</a>
        <button type="button" class="theme-toggle" data-theme-toggle aria-label="Dark mode" aria-pressed="false" title="Switch to dark mode" hidden><span class="theme-icon-moon">${icon('moon')}</span><span class="theme-icon-sun">${icon('sun')}</span></button>
      </nav>
    </header>
    <main id="main">${body}</main>
    ${footer(base)}
  </div>
</body>
</html>
`;
}

export function projectRow(project) {
  const p = project;
  const name = escapeHTML(p.title);
  const repository = safeURL(p.url);
  const staleTitle = p.stats_error ? `Commit stats could not be refreshed. ${p.stats_updated_at ? `Last checked ${p.stats_updated_at}.` : 'No previous stats available.'}` : `Commits on ${p.default_branch || 'the default branch'}`;
  const history = `${repository}/commits/${encodeURIComponent(p.default_branch || 'HEAD')}`;
  const metric = (label, value, url, title = '') => `<div class="metric${label === 'Commits' && p.stats_error ? ' stale' : ''}"${title ? ` title="${escapeHTML(title)}"` : ''}><span class="metric-label">${label}</span><a href="${url}" aria-label="${escapeHTML(`${p.title}: ${value === null ? 'unavailable' : number(value)} ${label.toLowerCase()}`)}">${number(value)}${label === 'Commits' && p.stats_error ? '<span class="stale-mark" aria-label="Could not refresh">*</span>' : ''}</a></div>`;
  const language = p.language ? `<span class="language ${escapeHTML(p.language.toLowerCase())}">${escapeHTML(p.language)}</span><span class="meta-divider" aria-hidden="true"></span>` : '';
  const lastCommit = p.last_commit_at ? `<a href="${safeURL(p.last_commit_url) || history}">${timeTag(p.last_commit_at)}</a>` : p.commits === 0 ? '<span>No commits yet</span>' : '<span>Unavailable</span>';
  return `<li class="project-row" data-project data-name="${name}" data-search="${escapeHTML(`${p.name} ${p.title} ${p.description || ''} ${p.language || ''}`.toLocaleLowerCase())}" data-stars="${Number.isFinite(p.stars) ? p.stars : 0}" data-updated="${Date.parse(p.last_commit_at) || 0}">
    <div class="project-main">
      <span class="project-icon ${escapeHTML(p.icon)}">${icon(p.icon)}</span>
      <div class="project-copy">
        <a class="project-name" href="${repository}" title="${escapeHTML(p.name)}">${name}${icon('external')}</a>
        ${p.description ? `<p class="project-description">${escapeHTML(p.description)}</p>` : '<div class="project-description"></div>'}
        <div class="project-meta">${language}<a class="policy-link" href="./privacy/${p.slug}/">Privacy policy</a>${safeURL(p.homepage) ? `<span class="meta-divider" aria-hidden="true"></span><a href="${safeURL(p.homepage)}">Website</a>` : ''}${p.archived ? '<span class="archived">Archived</span>' : ''}</div>
      </div>
    </div>
    ${metric('Stars', p.stars, `${repository}/stargazers`)}
    ${metric('Forks', p.forks, `${repository}/forks`)}
    ${metric('Commits', p.commits, history, staleTitle)}
    <div class="metric last-commit${p.stats_error ? ' stale' : ''}"${p.stats_error ? ` title="${escapeHTML(staleTitle)}"` : ''}><span class="metric-label">Last commit</span>${lastCommit}</div>
  </li>`;
}

export function homePage(snapshot, projects) {
  const totalStars = projects.reduce((sum, p) => sum + (p.stars || 0), 0);
  const knownCommits = projects.reduce((sum, p) => sum + (p.commits || 0), 0);
  const incompleteCommits = projects.some(p => p.commits === null);
  const body = `
    <section class="project-summary" aria-label="Organization statistics">
        <div class="hero-stats"><div class="hero-stat"><strong>${number(projects.length)}</strong><span>Public projects</span></div><div class="hero-stat"><strong>${number(totalStars)}</strong><span>GitHub stars</span></div><div class="hero-stat"><strong${incompleteCommits ? ' title="Some commit counts are unavailable"' : ''}>${number(knownCommits)}${incompleteCommits ? '+' : ''}</strong><span>Commits</span></div></div>
    </section>
    <section id="projects" aria-labelledby="projects-heading">
      <div class="section-toolbar"><div class="section-title"><h1 id="projects-heading">All projects</h1><span class="count-badge">${projects.length}</span></div>
        <div class="project-controls" data-project-controls hidden><label class="search-field">${icon('search')}<span class="sr-only">Search projects</span><input id="project-search" type="search" placeholder="Find a project…" autocomplete="off"></label><label><span class="sr-only">Sort projects</span><select class="sort-field" id="project-sort"><option value="updated">Recently updated</option><option value="name">Name: A–Z</option><option value="stars">Most stars</option></select></label></div>
      </div>
      <div class="table-head" aria-hidden="true"><span>Project</span><span>${icon('star')} Stars</span><span>${icon('fork')} Forks</span><span>${icon('commit')} Commits</span><span>Last commit</span></div>
      <ul class="project-list" data-project-list>${projects.map(projectRow).join('\n')}</ul>
      <div class="empty-state" data-empty hidden><h2>No projects found</h2><p>Try a different name or language.</p><button class="button" data-clear-search>Clear search</button></div>
      <div class="list-note"><span><span data-result-count aria-live="polite">${projects.length} projects</span> · Commit activity is from each default branch.${projects.some(p => p.stats_error) ? ' * Some commit stats could not be refreshed.' : ''}</span><span class="updated-note">${icon('clock')}Updated ${timeTag(snapshot.updated_at)} · Refreshes hourly</span></div>
    </section>`;
  return layout({ title: 'Projects — Marginally Better', description: 'Marginally Better projects, GitHub activity, and privacy policies.', body });
}

export function privacyIndex(projects) {
  const entries = projects.filter(p => p.policyPublished).sort((a, b) => a.title.localeCompare(b.title)).map(p => `<li class="policy-entry"><a href="./${p.slug}/"><span class="project-icon ${escapeHTML(p.icon)}">${icon(p.icon)}</span><span class="policy-entry-name">${escapeHTML(p.title)}</span><span class="policy-status published">Read policy</span>${icon('arrow')}</a></li>`).join('\n');
  return layout({ title: 'Privacy policies — Marginally Better', description: 'Find the privacy policy for each Marginally Better project.', base: '../', page: 'privacy', body: `<section class="page-intro"><h1>Privacy policies</h1></section>${entries ? `<ul class="policy-list">${entries}</ul>` : '<p class="policy-empty">No privacy policies have been published yet.</p>'}` });
}

export function policyPage(project, content = '') {
  const policy = content || `<div class="policy-placeholder"><h2>Policy not yet published</h2><p>A privacy policy for ${escapeHTML(project.title)} hasn’t been added here yet. This page will be updated when it’s available.</p><a class="button" href="${safeURL(project.url)}">Visit the project ${icon('external')}</a></div>`;
  return layout({ title: `${project.title} privacy policy — Marginally Better`, description: `Privacy information for ${project.title} by Marginally Better.`, base: '../../', page: 'privacy', body: `<section class="page-intro"><a class="back-link" href="../">${icon('arrow')}All privacy policies</a><p class="eyebrow">Privacy policy</p><h1>${escapeHTML(project.title)}</h1></section><article class="policy-content" aria-label="${escapeHTML(project.title)} privacy policy">${policy}</article>` });
}
