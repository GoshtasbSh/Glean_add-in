import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	use: {
		baseURL: "https://localhost:4173",
		ignoreHTTPSErrors: true,
	},
	webServer: {
		command: "pnpm preview --port 4173",
		url: "https://localhost:4173",
		reuseExistingServer: !process.env.CI,
		ignoreHTTPSErrors: true,
	},
	projects: [
		{
			name: "chromium",
			use: { browserName: "chromium" },
		},
	],
});
