# CI and dependency audit

**`ci.yml` installs unpinned deps.** `uv pip install -e ".[dev]"` and `npm ci` both resolve to the newest allowed versions, so a new mypy or a fresh advisory turns CI red without a code change.

The frontend `npm audit` gate is deliberately scoped to `--omit=dev`: the build toolchain (Vite / SvelteKit / Svelte 4) carries advisories that only a Svelte 5 + Vite 7 migration would clear, and none of it ships to a browser. `@sveltejs/kit` sits in `devDependencies` for that reason; that is where the SvelteKit template puts it too.

The `--omit=dev` tree is still not only shipped code:

- `@embedpdf/snippet`'s packages declare non-optional `svelte >=5` / `react` / `vue` peers, so npm auto-installs a nested Svelte 5 (and its `devalue`) as "prod" although only the preact build is bundled.
- `layerchart` likewise makes root Svelte 4 prod.

Their advisories hit the gate. Fix with a lockfile bump (`npm audit fix`), never `--force` (it moves root Svelte to 5).
