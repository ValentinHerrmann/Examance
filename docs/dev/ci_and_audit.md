# CI and dependency audit

**`ci.yml` installs unpinned deps.** `uv pip install -e ".[dev]"` and `npm ci` both resolve to the newest allowed versions, so a new mypy or a fresh advisory turns CI red without a code change.

The frontend `npm audit` gate is deliberately scoped to `--omit=dev`: the build toolchain (Vite / SvelteKit / Svelte) never ships to a browser, so a dev-server-only advisory must not block deploys. The full tree is still reported (non-blocking). `@sveltejs/kit` sits in `devDependencies` for that reason, as in the SvelteKit template.

The `--omit=dev` tree is still not only shipped code: `@embedpdf/snippet`'s packages declare non-optional `svelte >=5` / `react` / `vue` peers, so npm counts Svelte (and its `devalue`) as "prod" although only the preact build is bundled.

Their advisories hit the gate. Fix with a lockfile bump (`npm audit fix`), never `--force`.

The `docs` job builds the VitePress site in `docs/` (its own `package.json`, separate from the app), installing with `--ignore-scripts`: the only install scripts in its tree are esbuild's binary check (the binary comes from its platform package) and macOS-only fsevents. VitePress fails on dead internal links; links that leave the site (sources, PDFs, Marp slides) are rewritten to GitHub by `docs/.vitepress/config.mts`. Its dev-server advisories are not audited: the site is static HTML.

## SonarCloud

SonarCloud runs as automatic analysis (no scanner step in the workflows); its settings live in the root `.sonarcloud.properties`. The quality gate allows at most 3 % duplication on new code. The i18n catalogs are excluded from copy-paste detection because `en/*.ts` mirrors `de/*.ts` key for key by design. Loops that await on purpose one step at a time (memory bounds, the single LaTeX worker, the compile rate limit) carry `// NOSONAR: <reason>` on the flagged line instead of being parallelised.
