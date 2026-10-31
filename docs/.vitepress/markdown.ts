import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type MarkdownIt from 'markdown-it';
import type { Plugin } from 'vite';

// Turns what reads fine on GitHub (task lists, code-span paths, bare issue numbers, links into the repo) into working site links.
export const REPO_URL = 'https://github.com/ValentinHerrmann/Examance';
export const DOCS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(DOCS_ROOT, '..');

// Marp slide sources and demo-instance tooling are not pages; developer pages link them on GitHub.
export const SRC_EXCLUDE = ['demo-instance/**', 'pitches/**', 'posters/**', 'screenshots/**', 'node_modules/**', 'README.md'];
const EXCLUDED_DIRS = ['demo-instance/', 'pitches/', 'posters/', 'screenshots/'];

/** Files served by the site itself (opened in the browser, not GitHub's viewer), as paths relative to docs/. */
export const SITE_FILES: string[] = [
  ...['pitches', 'posters'].flatMap((dir) =>
    readdirSync(resolve(DOCS_ROOT, dir)).filter((f) => f.endsWith('.pdf')).map((f) => `${dir}/${f}`),
  ),
  'openapi.json',
];

/** Copies SITE_FILES into the build output (VitePress `buildEnd`). */
export function copySiteFiles(outDir: string): void {
  for (const file of SITE_FILES) {
    mkdirSync(dirname(resolve(outDir, file)), { recursive: true });
    copyFileSync(resolve(DOCS_ROOT, file), resolve(outDir, file));
  }
}

/** Serves SITE_FILES in `vitepress dev`, where buildEnd never runs. */
export function siteFilesDevServer(base: string): Plugin {
  return {
    name: 'examance-site-files',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent((req.url ?? '').split('?')[0]);
        const file = path.startsWith(base) ? path.slice(base.length) : '';
        if (!SITE_FILES.includes(file)) return next();
        res.setHeader('Content-Type', file.endsWith('.pdf') ? 'application/pdf' : 'application/json');
        res.end(readFileSync(resolve(DOCS_ROOT, file)));
      });
    },
  };
}

const isPage = (docsPath: string): boolean =>
  docsPath.endsWith('.md') && !EXCLUDED_DIRS.some((d) => docsPath.startsWith(d)) && existsSync(resolve(DOCS_ROOT, docsPath));

function githubUrl(repoPath: string, hash = ''): string {
  const full = resolve(REPO_ROOT, repoPath);
  const kind = existsSync(full) && statSync(full).isDirectory() ? 'tree' : 'blob';
  return `${REPO_URL}/${kind}/release/${repoPath.replace(/\/$/, '')}${hash ? `#${hash}` : ''}`;
}

/** Rewrites a relative link that is no site page: site files to the site, anything else in the repo to GitHub on `release`. */
function rewriteRelativeHref(href: string, pageRelPath: string, base: string): string | null {
  if (/^([a-z][a-z0-9+.-]*:|#|\/)/i.test(href)) return null;
  const [path, hash = ''] = href.split('#', 2);
  if (!path) return null;
  const target = posix.normalize(posix.join(posix.dirname(pageRelPath), path));
  const insideDocs = !target.startsWith('../');
  if (insideDocs && SITE_FILES.includes(target)) return `${base}${target}`;
  if (insideDocs && (isPage(target) || /\.(png|jpe?g|gif|webp|svg)$/i.test(target))) return null;
  const repoPath = relative(REPO_ROOT, resolve(DOCS_ROOT, target)).split('\\').join('/');
  return existsSync(resolve(REPO_ROOT, repoPath)) ? githubUrl(repoPath, hash) : null;
}

// Short paths in the docs omit these prefixes (`lib/about/posters.ts`, `app/cli.py`); a path is linked only if exactly one prefix fits.
const SOURCE_PREFIXES = ['', 'frontend/src/', 'frontend/', 'backend/app/', 'backend/'];

/** Repo path for a code span that names a source file or folder, or null when it names none or several. */
function resolveSourcePath(text: string): string | null {
  const path = text.replace(/^\/+/, '');
  if (!path.includes('/') || !/^[\w.@[\]+-][\w./@[\]+-]*$/.test(path)) return null;
  const hits = new Set(SOURCE_PREFIXES.map((p) => p + path).filter((p) => existsSync(resolve(REPO_ROOT, p))));
  return hits.size === 1 ? [...hits][0] : null;
}

/** Relative `.md` link from one page to another, so VitePress resolves base and clean URLs and checks it. */
function pageLink(fromPage: string, toPage: string): string {
  const rel = posix.relative(posix.dirname(fromPage), toPage);
  return rel.startsWith('.') ? rel : `./${rel}`;
}

const ISSUE_RE = /(^|[^\w&/#])#(\d{2,4})\b/g;
const TASK_RE = /^\[([ xX])\]\s+/;

export function examanceMarkdown(md: MarkdownIt, base: string): void {
  md.core.ruler.after('inline', 'examance-site-links', (state) => {
    const page: string = state.env.relativePath ?? '';
    const Token = state.Token;
    const link = (href: string, external: boolean) => {
      const open = new Token('link_open', 'a', 1);
      open.attrSet('href', href);
      if (external) {
        open.attrSet('target', '_blank');
        open.attrSet('rel', 'noreferrer');
      }
      return [open, new Token('link_close', 'a', -1)] as const;
    };

    state.tokens.forEach((block, index) => {
      if (block.type === 'inline' && block.children) {
        const out: typeof block.children = [];
        let linkDepth = 0;
        for (const token of block.children) {
          if (token.type === 'link_open') {
            linkDepth++;
            const href = token.attrGet('href');
            const rewritten = href ? rewriteRelativeHref(href, page, base) : null;
            if (rewritten) {
              token.attrSet('href', rewritten);
              token.attrSet('target', '_blank');
              token.attrSet('rel', 'noreferrer');
            }
          } else if (token.type === 'link_close') {
            linkDepth--;
          } else if (linkDepth === 0 && token.type === 'code_inline') {
            const docRef = /^docs\/([\w./-]+\.md)(\s.*)?$/.exec(token.content);
            const source = docRef ? null : resolveSourcePath(token.content);
            const href = docRef && isPage(docRef[1]) ? pageLink(page, docRef[1]) : source ? githubUrl(source) : null;
            if (href) {
              const [open, close] = link(href, !docRef);
              out.push(open, token, close);
              continue;
            }
          } else if (linkDepth === 0 && token.type === 'text' && ISSUE_RE.test(token.content)) {
            ISSUE_RE.lastIndex = 0;
            let last = 0;
            for (const m of token.content.matchAll(ISSUE_RE)) {
              const start = m.index + m[1].length;
              const text = new Token('text', '', 0);
              text.content = token.content.slice(last, start);
              const label = new Token('text', '', 0);
              label.content = `#${m[2]}`;
              const [open, close] = link(`${REPO_URL}/issues/${m[2]}`, true);
              out.push(text, open, label, close);
              last = start + label.content.length;
            }
            const rest = new Token('text', '', 0);
            rest.content = token.content.slice(last);
            out.push(rest);
            continue;
          }
          out.push(token);
        }
        block.children = out;
      }

      // GitHub task list: `- [ ] text` becomes a disabled checkbox.
      const first = block.type === 'inline' ? block.children?.[0] : undefined;
      const item = state.tokens[index - 2];
      if (first?.type === 'text' && item?.type === 'list_item_open' && TASK_RE.test(first.content)) {
        const checked = TASK_RE.exec(first.content)![1] !== ' ';
        first.content = first.content.replace(TASK_RE, '');
        const box = new Token('html_inline', '', 0);
        box.content = `<input type="checkbox" class="task-list-item-checkbox" disabled${checked ? ' checked' : ''}> `;
        block.children!.unshift(box);
        item.attrJoin('class', 'task-list-item');
      }
    });
  });
}
