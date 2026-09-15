import MarkdownIt from 'markdown-it';
import { cleanMarkdown } from '../scripts/update-policies.mjs';

const markdown = new MarkdownIt({ html: false, linkify: true });

export function renderPolicyMarkdown(content, sourceURL) {
  const tokens = markdown.parse(cleanMarkdown(content), {});
  const visit = token => {
    if (token.type === 'link_open') {
      const href = token.attrGet('href');
      if (href && !href.startsWith('#')) {
        try {
          const resolved = new URL(href, sourceURL).href;
          token.attrSet('href', markdown.validateLink(resolved) ? resolved : '#');
        } catch { token.attrSet('href', '#'); }
      }
    }
    for (const child of token.children || []) visit(child);
  };
  // Keep a single page-level heading; preserve the Markdown's heading hierarchy.
  for (const token of tokens) {
    if (/^heading_(?:open|close)$/.test(token.type)) token.tag = `h${Math.min(Number(token.tag.slice(1)) + 1, 6)}`;
    visit(token);
  }
  return markdown.renderer.render(tokens, markdown.options, {});
}

// Policies need text, not third-party image requests on every visitor's browser.
markdown.renderer.rules.image = (tokens, index) => markdown.utils.escapeHtml(tokens[index].content);
