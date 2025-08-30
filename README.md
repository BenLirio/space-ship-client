# Space Ship Client

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

## Next Ideas

- Add inertia particle trail
- Add asteroids to dodge
- Add WASD controls and mobile joystick
- Add shooting projectiles

## License

MIT
