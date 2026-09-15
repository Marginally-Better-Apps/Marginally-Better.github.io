# Project privacy policies

## Publish from a project's repository

1. Add the policy as `PRIVACY.md` or `privacy-policy.md` in that project's **main** branch.
2. Commit and push the file, or merge its pull request into main.
3. The next successful hourly Pages refresh discovers it and displays the Markdown on this site. Run **Build and deploy GitHub Pages** manually to refresh sooner.

The privacy directory lists only projects with a policy. The URL is `privacy/<lowercase-repository-name>/`, for example `privacy/mb-photos/`. Updates to the same Markdown file appear at the same URL. Deleting the file removes the project from the directory on the next refresh.

The updater checks **main**, even if a repository uses another default branch. It discovers these names case-insensitively, at the root or in nested directories:

- `PRIVACY.md`
- `privacy-policy.md`
- `privacy_policy.md`
- `privacy policy.md`
- `privacypolicy.md`
- The same names ending in `.markdown`

The shallowest matching file wins; `PRIVACY.md` takes priority within the same directory depth, followed by alphabetical order. Empty/comment-only files, symlinks, and dependency directories (`node_modules`, `vendor`, `Pods`, `.build`, `.git`) are ignored. Front matter and HTML comments are omitted from display. Markdown headings, links, lists, code, and tables render locally; embedded HTML is escaped, and images display their alt text.

Photos uses `PRIVACY.md`; Tuner uses `store-listing/privacy-policy.md`. No per-project URL configuration is needed.

## Refresh locally

```sh
npm run update:policies
npm run build
npm run preview
```

`npm run update` refreshes both the public project list and policies. The cached policy source is `data/policies.json`. A network/rate-limit error or truncated repository listing aborts the policy refresh and deployment, preserving the previous published site.

Hourly refreshes run through GitHub Actions once Pages is enabled and the source is pushed. Commits to another project's main are picked up on the next run; cross-repository commits do not instantly trigger this site's workflow.

## Optional local fallback

If a project has no Markdown policy on main, add an HTML fragment to `policies/<exact-repository-name>.html`. The comment-only starter files remain unpublished until real content is added. Use `<h2>` headings, `<p>` paragraphs, and lists. The site supplies the title and layout. Repository Markdown takes precedence when present.

Files beginning with a dot receive a `~` URL prefix (`.github` → `privacy/~.github/`) so GitHub Pages includes their pages. URLs remain stable while repository names stay the same.
