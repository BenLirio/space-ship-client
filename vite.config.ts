import { defineConfig } from "vite";

// Use env var VITE_BASE_PATH (injected in CI) or default to '/' for local dev.
export default defineConfig(({ command }) => {
  return {
    base: command === "serve" ? "/" : process.env.VITE_BASE_PATH || "/",
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
  };
});
