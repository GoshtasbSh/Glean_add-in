import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	use: {
		baseURL: "http://localhost:4173",
	},
	webServer: {
		command: "pnpm preview --port 4173",
		url: "http://localhost:4173",
		reuseExistingServer: !process.env.CI,
	},
	projects: [
		{
			name: "chromium",
			use: { browserName: "chromium" },
		},
	],
});
