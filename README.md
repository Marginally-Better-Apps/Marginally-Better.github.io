# Marginally Better

A minimal GitHub Pages home for [Marginally Better Apps](https://github.com/Marginally-Better-Apps). Includes every public repository, stars, forks, default-branch commit counts, last-commit timestamps, and a privacy-policy directory.

Plain HTML, CSS, and small progressive-enhancement scripts. No runtime dependencies, external fonts, analytics, cookies, or browser GitHub API requests. All project data and policy content are rendered into static HTML at build time, so the full site works without JavaScript. JavaScript adds search, sorting, relative dates, and a dark-mode toggle. The theme follows the system setting until you choose light or dark mode; that choice is saved locally in the browser.

## Local preview

Requires Node.js 18.17 or newer. Markdown is rendered at build time with `markdown-it`.

```sh
npm ci --ignore-scripts
npm run dev
```

Open [localhost:4173](http://127.0.0.1:4173). Rebuild after editing source files. To refresh GitHub data or run checks:

```sh
npm run update
npm test
npm run build
```

`npm run build` writes the deployable site to `_site/`. `npm run preview` serves that build.

## GitHub Pages setup

1. Push the source to the repository’s `main` branch.
2. In **Settings → Pages → Build and deployment**, choose **GitHub Actions** as the source.
3. Run **Build and deploy GitHub Pages** in the Actions tab, or push a change to `main`.

The workflow checks the site, refreshes public repository stats and privacy Markdown from every project's `main` branch, builds it, and deploys it. It runs at minute 17 each hour and can be triggered manually. Pull requests run tests and build from the checked-in snapshots without deploying. Commits to another project's `main` are picked up on the next successful hourly run; they do not trigger this repository's push workflow immediately.

**Organization homepage naming:** this repository is currently `Marginally-Better-Apps/Marginally-Better.github.io`, which publishes as a project site at `https://marginally-better-apps.github.io/Marginally-Better.github.io/`. To use `https://marginally-better-apps.github.io/` as the organization homepage, name the repository `Marginally-Better-Apps.github.io`. The site uses relative links and works at either location. See [GitHub’s repository naming instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site) and [custom workflow setup](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Project statistics

- `scripts/update-projects.mjs` fetches all pages of the organization’s **public** repositories, including archived repositories, forks, `.github`, and this site. New public projects appear on the next successful refresh.
- Stars and forks come from GitHub’s repository API. Commit counts include all commits reachable from the **default branch**, including inherited history in forked projects; they are not a count of contributions made by this organization.
- The latest commit’s **committer timestamp** is used for “Last commit”; it is not the repository’s pushed/updated timestamp. Hover a time for its exact UTC date and time.
- A confirmed empty repository shows `0` commits and “No commits yet.” Unavailable counts show `—`. If a commit request fails, a previous snapshot value is retained and marked with an asterisk, with its last successful check in the tooltip.
- An unsuccessful repository listing fails the update and leaves the existing snapshot/site intact. Scheduled runs use the checked-in snapshot as their fallback. Run `npm run update` and commit the JSON when you want to refresh that baseline.
- The built-in `GITHUB_TOKEN` is used only in the Actions build. Locally, the script can run unauthenticated, or use an optional `GITHUB_TOKEN` environment variable for a higher API limit. Never put tokens in site source or generated files.
- `data/projects.json` is the initial checked-in snapshot. `data/project-details.json` supplies optional display titles, concise descriptions, and icons. Unknown projects get their GitHub name and description automatically.

GitHub may delay scheduled runs, and public repositories’ schedules can be disabled after prolonged inactivity. The page always shows the snapshot update time; the workflow can be run manually to refresh it.

## Privacy policies

Commit a `PRIVACY.md` or `privacy-policy.md` file to a project's **main** branch. The updater searches each public repository, including nested directories, fetches the actual Markdown, and stores it in `data/policies.json`. The build renders it directly at `privacy/<lowercase-repository-name>/`. Visitors read the content here, without a redirect to GitHub. The privacy directory lists only projects with policy content.

The scheduled refresh discovers new policies, updates changed content, and removes deleted policies from the directory. A failed GitHub request or incomplete tree stops the refresh/deployment and preserves the last published site. Run `npm run update:policies` followed by `npm run build` to refresh the local preview. `npm run update` refreshes both projects and policies.

Photos and Tuner are currently discovered automatically. As an optional fallback for projects without repository Markdown, you can author `policies/<exact-repository-name>.html`. Repository Markdown takes precedence. Stable routes remain available for unpublished projects, but those projects are hidden from the privacy directory.

See [policies/README.md](policies/README.md) for the authoring workflow.

Leading-dot repository names receive a `~` prefix in their URL (`.github` → `privacy/~.github/`) so the Pages upload includes them.

## Source layout

| Path | Purpose |
| --- | --- |
| `src/render.mjs` | Static page templates and project rendering |
| `src/styles.css` | Responsive layout and visual styles |
| `src/app.js` | Optional search, sorting, and relative dates |
| `src/theme.js` | System-aware light/dark mode and saved preference |
| `src/markdown.mjs` | Safe build-time Markdown rendering |
| `src/logo.jpg` | Original logo used for the browser tab icon |
| `src/logo.png` | RGB header logo, prepared at 4× display size |
| `scripts/build.mjs` | Generates the complete static site |
| `scripts/update-projects.mjs` | GitHub repository and commit data |
| `scripts/update-policies.mjs` | Discover and fetch privacy Markdown from main |
| `data/` | Stats snapshot and display details |
| `policies/` | Per-project privacy policy content |
| `.github/workflows/pages.yml` | Validation, scheduled refresh, and deployment |
