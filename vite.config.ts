import { defineConfig } from "vite";

// Production deployments sometimes live under a sub-path (e.g. /space-ship-client/).
// We allow an explicit VITE_BASE_PATH (set in GitHub Actions) but if it's not
// provided we fall back to a *relative* base ('./') so the built index.html can
// be dropped into any folder (S3, reverse proxy subdir, etc.) without 404s for
// /assets/... . Dev server must still use '/'.
export default defineConfig(({ command }) => {
  const isDev = command === "serve";
  const explicit = process.env.VITE_BASE_PATH;
  return {
    base: isDev ? "/" : explicit ?? "./",
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
  };
});
