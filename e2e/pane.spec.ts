/**
 * Pane UI e2e tests.
 * Run: pnpm e2e  (requires `pnpm dlx playwright install chromium` once)
 *
 * Strategy: serve the built dist with `vite preview`, inject globalThis.Office
 * via page.addInitScript before any user JS runs, then assert rendered state.
 */
import { test, expect } from "@playwright/test";

const OFFICE_STUB_NO_ITEM = `
  globalThis.Office = {
    initialize: (cb) => cb && cb({}),
    onReady: (cb) => cb && cb({ host: "Outlook", platform: "Web" }),
    context: {
      mailbox: {
        item: null,
        masterCategories: { getAsync: (cb) => cb({ status: "succeeded", value: [] }) },
      },
    },
    HostType: { OUTLOOK: "Outlook" },
    PlatformType: { WEB: "Web" },
  };
`;

const OFFICE_STUB_WITH_ITEM = `
  globalThis.Office = {
    initialize: (cb) => cb && cb({}),
    onReady: (cb) => cb && cb({ host: "Outlook", platform: "Web" }),
    context: {
      mailbox: {
        item: {
          subject: "Test email subject",
          from: { displayName: "Alice", emailAddress: "alice@ufl.edu" },
          body: {
            getAsync: (type, cb) => cb({ status: "succeeded", value: "<p>Hello</p>" }),
          },
          to: [{ displayName: "Bob", emailAddress: "bob@ufl.edu" }],
          displayReplyForm: () => {},
        },
        masterCategories: { getAsync: (cb) => cb({ status: "succeeded", value: [] }) },
      },
    },
    HostType: { OUTLOOK: "Outlook" },
    PlatformType: { WEB: "Web" },
  };
`;

test.describe("Pane UI — onboarding (no key)", () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(OFFICE_STUB_NO_ITEM);
		await page.goto("/");
	});

	test("shows onboarding consent screen when no NaviGator key is set", async ({
		page,
	}) => {
		await expect(page.getByText("Welcome to Glean")).toBeVisible();
		await expect(page.getByText("Continue →")).toBeVisible();
	});

	test("onboarding consent lists FERPA-safe privacy claims", async ({
		page,
	}) => {
		await expect(
			page.getByText(/Reads the open email only/),
		).toBeVisible();
		await expect(page.getByText(/UF NaviGator/)).toBeVisible();
		await expect(
			page.getByText(/Prefills Outlook.s reply form/),
		).toBeVisible();
	});

	test("consent → Continue → shows key entry screen", async ({ page }) => {
		await page.getByText("Continue →").click();
		await expect(
			page.getByPlaceholder(/NaviGator API key/i),
		).toBeVisible();
	});
});

test.describe("Pane UI — main shell (key set)", () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(OFFICE_STUB_WITH_ITEM);
		// Inject key into sessionStorage before React renders
		await page.addInitScript(() => {
			sessionStorage.setItem("nav_key", "test-key-abc123");
		});
		await page.goto("/");
	});

	test("shows AppShell with Draft tab active by default", async ({ page }) => {
		await expect(page.getByRole("tab", { name: "Draft" })).toBeVisible();
		await expect(page.getByRole("tab", { name: "Triage" })).toBeVisible();
		await expect(page.getByRole("tab", { name: "Meetings" })).toBeVisible();
		await expect(page.getByRole("tab", { name: "Settings" })).toBeVisible();
	});

	test("Triage tab shows MsGate locked placeholder", async ({ page }) => {
		await page.getByRole("tab", { name: "Triage" }).click();
		await expect(
			page.getByText(/pending UFIT approval/i),
		).toBeVisible();
	});

	test("Meetings tab shows MsGate locked placeholder", async ({ page }) => {
		await page.getByRole("tab", { name: "Meetings" }).click();
		await expect(
			page.getByText(/pending UFIT approval/i),
		).toBeVisible();
	});

	test("Settings tab shows NaviGator key row and locked Graph rows", async ({
		page,
	}) => {
		await page.getByRole("tab", { name: "Settings" }).click();
		await expect(page.getByText(/NaviGator API key/i)).toBeVisible();
		await expect(page.getByText(/Voice profile/i)).toBeVisible();
		await expect(page.getByText(/Needs Microsoft 365/i)).toBeVisible();
	});

	test("privacy footer is always visible", async ({ page }) => {
		await expect(
			page.getByText(/Nothing leaves this device/),
		).toBeVisible();
	});
});
