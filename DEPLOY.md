# Deploying the FREE Local Glean add-in

The add-in is **static files with no secrets**, deployed to GitHub Pages from the dedicated
**public** repo `GoshtasbSh/Glean_add-in`. The private monorepo stays private; only the
self-contained `addin/` is published.

## Hosting target

- Pages URL (project site): **`https://goshtasbsh.github.io/Glean_add-in/`**
- Prod manifest: `manifest/manifest.prod.xml` → `SourceLocation` points at that URL.
- Vite `base` is `/Glean_add-in/` for `build` (override with `ADDIN_BASE` for another host).

## Reproducible build from a clean clone

```bash
git clone https://github.com/GoshtasbSh/Glean_add-in
cd Glean_add-in
pnpm install --frozen-lockfile
pnpm build           # → dist/  (base path /Glean_add-in/, no source maps, no secrets)
```

`pnpm build` is headless-safe: the dev-only HTTPS cert step runs only for `pnpm dev`.

## Continuous deploy

`.github/workflows/deploy-addin.yml` builds and publishes to Pages on every push to `main`
(and via "Run workflow"). All action versions are **pinned by commit SHA**. Pages source must
be set to **GitHub Actions** (repo → Settings → Pages → Build and deployment → GitHub Actions).

## Publishing the monorepo's addin/ to the deploy repo

From the monorepo, push the `addin/` subtree to the deploy repo's `main`:

```bash
git subtree split --prefix=addin -b addin-deploy
git push https://github.com/GoshtasbSh/Glean_add-in addin-deploy:main
git branch -D addin-deploy
```

(The workflow lives at `addin/.github/workflows/` so it lands at the deploy repo root.)

## Two manifests

- `manifest/manifest.dev.xml` — DisplayName **"Local Glean (dev)"**, `https://localhost:3000`,
  GUID `9c5b1386-…`. For `pnpm dev` sideload.
- `manifest/manifest.prod.xml` — DisplayName **"Local Glean"**, the Pages URL, GUID
  `5fc5aef8-…`. Different GUIDs let both be sideloaded at once.

## Account hardening (operator)

- Turn **2FA on** for the GitHub account.
- **Branch protection** on `main` of the deploy repo so only reviewed commits publish.
