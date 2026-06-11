import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { getHttpsServerOptions } from "office-addin-dev-certs";

export default defineConfig(async () => {
  const httpsOptions = await getHttpsServerOptions();
  return {
    plugins: [react()],
    base: "./",
    server: {
      port: 3000,
      https: httpsOptions,
    },
    build: {
      outDir: "dist",
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/test-setup.ts"],
    },
  };
});
