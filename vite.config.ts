import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { getHttpsServerOptions } from "office-addin-dev-certs";

export default defineConfig(async ({ command }) => {
  // Relative base: assets resolve relative to index.html, so the SAME build
  // works under the GitHub Pages PROJECT sub-path (/Glean_add-in/), at local
  // `vite preview` root (e2e), and behind any custom domain — no repo coupling.
  const isServe = command === "serve";
  // Dev-only HTTPS: only generate/read localhost certs for the dev server, so a
  // headless CI `vite build` (GitHub Pages) never touches office-addin-dev-certs.
  const server = isServe
    ? { port: 3000, https: await getHttpsServerOptions() }
    : undefined;
  return {
    plugins: [react()],
    base: "./",
    server,
    build: {
      outDir: "dist",
      // Never ship source maps in the production bundle (security review).
      sourcemap: false,
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/test-setup.ts"],
      exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
    },
  };
});
