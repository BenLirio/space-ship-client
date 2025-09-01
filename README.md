# Spaceship Client

A tiny Phaser 3 + TypeScript starter featuring a simple steer-and-thrust spaceship you can fly around the screen with arrow keys.

## Features

- Vite dev server (fast reload)
- TypeScript strict mode
- Phaser 3 arcade physics
- Procedurally generated ship texture (no assets required)
- Screen wrap movement

## Controls

- Up Arrow: Thrust forward
- Left / Right Arrows: Rotate

## Setup

Install dependencies and start dev server:

```bash
npm install
npm run dev
```

Then open the shown local URL (typically http://localhost:5173).

### API Endpoint Configuration

The ship generation endpoint is configurable via an environment variable.

1. Copy `.env.example` to `.env` (ignored by git):

```bash
cp .env.example .env
```

2. (Optional) Edit `VITE_GENERATE_SHIP_URL` to point to a different backend.

If not set, defaults are:

- Dev (`npm run dev`): `http://localhost:3000/generate-space-ship`
- Prod build (`npm run build`): `https://9rc13jr0p2.execute-api.us-east-1.amazonaws.com/generate-space-ship`

You can also change the defaults centrally in `src/config.ts`.

## Build

```bash
npm run build
```

Output goes to `dist/`.

## Deployment (GitHub Pages)

This repo is configured to auto-deploy the built game to **GitHub Pages** on every push to `master`.

### How it works

- A GitHub Actions workflow at `.github/workflows/deploy.yml` installs deps, runs `npm run build`, and publishes the `dist/` folder to Pages.
- The Vite `base` path is automatically set for production builds via an env var (`VITE_BASE_PATH`) so relative asset paths work when served from `https://<user>.github.io/<repo>/`.

### One-time setup steps

1. In the repository settings on GitHub, go to: Settings → Pages.
2. Ensure "Build and deployment" is set to "GitHub Actions" (should auto-detect after first successful workflow run).

### Triggering a deploy

Just push to `master` (or use the "Run workflow" button). The workflow will:

1. Install dependencies (cached).
2. Type-check & build (`npm run build`).
3. Upload `dist/` as a Pages artifact.
4. Deploy to the `github-pages` environment.

### Local preview of production build

```bash
npm run build
npm run preview
```

Open the printed URL (defaults to `http://localhost:4173`).

### Changing the repository name or publishing to a custom domain

- If you rename the repo, deployments continue to work—Vite base path is derived dynamically in CI.
- For a custom domain, add a `CNAME` file into `public/` (create folder) or place it in `dist/` via a build plugin; then configure the Pages custom domain in settings. Remove/override the `VITE_BASE_PATH` if serving from root.

### Troubleshooting

- 404 on assets: confirm the built `<script type="module" src="...">` path starts with `/<repo-name>/` in the deployed HTML.
- Old code appears: force-refresh (cached assets). Consider versioned file names (Vite already hashes) and clear browser cache.
- Workflow fails at build: open the Actions tab and inspect the failing step logs.
- PWA manifest 404: ensure `public/manifest.webmanifest` exists in the repo (Vite copies everything from `public/` to the build root) and that the `<link rel="manifest" href="manifest.webmanifest">` in `index.html` is **relative** (no leading slash) for sub-path hosting.
- Icons missing: add `public/icons/icon-192.png` and `public/icons/icon-512.png` (or adjust paths in the manifest). If these files are absent the browser will log 404s but the app will still run.

---

Deployment status and URL are visible in the repo's "Environments" section after the first successful run.

## Next Ideas

- Add inertia particle trail
- Add asteroids to dodge
- Add WASD controls and mobile joystick
- Add shooting projectiles

## License

MIT
