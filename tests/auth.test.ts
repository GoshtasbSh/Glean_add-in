import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuth } from "../src/auth/msal";
import { GRAPH_SCOPES } from "../src/auth/scopes";

const h = vi.hoisted(() => {
	class FakeInteractionRequiredAuthError extends Error {}
	return {
		mockInitialize: vi.fn(async () => {}),
		mockLoginPopup: vi.fn(),
		mockAcquireTokenSilent: vi.fn(),
		mockAcquireTokenPopup: vi.fn(),
		mockSetActiveAccount: vi.fn(),
		mockGetActiveAccount: vi.fn(),
		mockClearCache: vi.fn(async () => {}),
		mockLogoutPopup: vi.fn(async () => {}),
		lastConfig: undefined as Record<string, unknown> | undefined,
		constructCount: 0,
		FakeInteractionRequiredAuthError,
	};
});

const {
	mockInitialize,
	mockLoginPopup,
	mockAcquireTokenSilent,
	mockAcquireTokenPopup,
	mockSetActiveAccount,
	mockGetActiveAccount,
	mockClearCache,
	mockLogoutPopup,
	FakeInteractionRequiredAuthError,
} = h;

vi.mock("@azure/msal-browser", () => ({
	PublicClientApplication: class {
		constructor(config: Record<string, unknown>) {
			h.lastConfig = config;
			h.constructCount += 1;
		}
		initialize = h.mockInitialize;
		loginPopup = h.mockLoginPopup;
		acquireTokenSilent = h.mockAcquireTokenSilent;
		acquireTokenPopup = h.mockAcquireTokenPopup;
		setActiveAccount = h.mockSetActiveAccount;
		getActiveAccount = h.mockGetActiveAccount;
		clearCache = h.mockClearCache;
		logoutPopup = h.mockLogoutPopup;
	},
	InteractionRequiredAuthError: h.FakeInteractionRequiredAuthError,
	BrowserCacheLocation: { MemoryStorage: "memoryStorage" },
}));

const FAKE_ACCOUNT = { username: "gator@ufl.edu", name: "Albert Gator" };

beforeEach(() => {
	vi.clearAllMocks();
	h.lastConfig = undefined;
	h.constructCount = 0;
	mockInitialize.mockImplementation(async () => {});
	mockLogoutPopup.mockImplementation(async () => {});
	vi.stubEnv("VITE_ENTRA_CLIENT_ID", "test-client-id");
	vi.stubEnv("VITE_ENTRA_TENANT_ID", "organizations");
});

describe("GRAPH_SCOPES", () => {
	it("contains exactly the OVERVIEW §2.7 delegated scopes", () => {
		expect(GRAPH_SCOPES).toEqual([
			"User.Read",
			"Mail.Read",
			"Mail.ReadWrite",
			"MailboxSettings.ReadWrite",
			"Files.ReadWrite.AppFolder",
			"Tasks.ReadWrite",
			"Calendars.Read",
			"offline_access",
		]);
	});
});

describe("createAuth", () => {
	it("configures MSAL with in-memory cache (custody rule)", async () => {
		const auth = createAuth();
		mockLoginPopup.mockResolvedValue({ account: FAKE_ACCOUNT });
		await auth.signIn();
		expect(h.lastConfig).toBeDefined();
		expect(
			(h.lastConfig as { cache: { cacheLocation: string } }).cache
				.cacheLocation,
		).toBe("memoryStorage");
	});

	it("builds authority from the tenant env var", async () => {
		const auth = createAuth();
		mockLoginPopup.mockResolvedValue({ account: FAKE_ACCOUNT });
		await auth.signIn();
		expect(
			(h.lastConfig as { auth: { authority: string } }).auth.authority,
		).toBe("https://login.microsoftonline.com/organizations");
	});

	it("throws a config error when client ID is missing", async () => {
		vi.stubEnv("VITE_ENTRA_CLIENT_ID", "");
		const auth = createAuth();
		await expect(auth.signIn()).rejects.toThrow(/VITE_ENTRA_CLIENT_ID/);
	});

	it("signIn uses loginPopup with GRAPH_SCOPES and sets the active account", async () => {
		const auth = createAuth();
		mockLoginPopup.mockResolvedValue({ account: FAKE_ACCOUNT });
		const account = await auth.signIn();
		expect(mockLoginPopup).toHaveBeenCalledWith(
			expect.objectContaining({ scopes: GRAPH_SCOPES }),
		);
		expect(mockSetActiveAccount).toHaveBeenCalledWith(FAKE_ACCOUNT);
		expect(account).toEqual(FAKE_ACCOUNT);
	});

	it("getToken returns the silent token when silent succeeds", async () => {
		const auth = createAuth();
		mockLoginPopup.mockResolvedValue({ account: FAKE_ACCOUNT });
		mockGetActiveAccount.mockReturnValue(FAKE_ACCOUNT);
		mockAcquireTokenSilent.mockResolvedValue({
			accessToken: "silent-token-abc",
		});
		await auth.signIn();
		const token = await auth.getToken();
		expect(token).toBe("silent-token-abc");
		expect(mockAcquireTokenPopup).not.toHaveBeenCalled();
	});

	it("getToken falls back to popup on InteractionRequiredAuthError", async () => {
		const auth = createAuth();
		mockLoginPopup.mockResolvedValue({ account: FAKE_ACCOUNT });
		mockGetActiveAccount.mockReturnValue(FAKE_ACCOUNT);
		mockAcquireTokenSilent.mockRejectedValue(
			new FakeInteractionRequiredAuthError("ui needed"),
		);
		mockAcquireTokenPopup.mockResolvedValue({ accessToken: "popup-token-xyz" });
		await auth.signIn();
		const token = await auth.getToken();
		expect(token).toBe("popup-token-xyz");
		expect(mockAcquireTokenPopup).toHaveBeenCalledWith(
			expect.objectContaining({ scopes: GRAPH_SCOPES }),
		);
	});

	it("getToken propagates non-interaction errors without calling popup", async () => {
		const auth = createAuth();
		mockLoginPopup.mockResolvedValue({ account: FAKE_ACCOUNT });
		mockGetActiveAccount.mockReturnValue(FAKE_ACCOUNT);
		mockAcquireTokenSilent.mockRejectedValue(new Error("network_down"));
		await auth.signIn();
		await expect(auth.getToken()).rejects.toThrow("Token acquisition failed");
		expect(mockAcquireTokenPopup).not.toHaveBeenCalled();
	});

	it("concurrent calls share one initialized instance (no init race)", async () => {
		const order: string[] = [];
		mockInitialize.mockImplementation(async () => {
			await new Promise((r) => setTimeout(r, 10));
			order.push("init");
		});
		mockLoginPopup.mockImplementation(async () => {
			order.push("login");
			return { account: FAKE_ACCOUNT };
		});
		const auth = createAuth();
		await Promise.all([auth.signIn(), auth.signIn()]);
		expect(h.constructCount).toBe(1);
		// initialize must complete before ANY use of the instance
		expect(order).toEqual(["init", "login", "login"]);
	});

	it("getToken throws when not signed in", async () => {
		const auth = createAuth();
		mockGetActiveAccount.mockReturnValue(null);
		await expect(auth.getToken()).rejects.toThrow(/sign/i);
	});

	it("signOut ends the Entra session via logoutPopup and clears local state", async () => {
		const auth = createAuth();
		mockLoginPopup.mockResolvedValue({ account: FAKE_ACCOUNT });
		await auth.signIn();
		await auth.signOut();
		expect(mockLogoutPopup).toHaveBeenCalled();
		expect(mockClearCache).toHaveBeenCalled();
		expect(mockSetActiveAccount).toHaveBeenLastCalledWith(null);
	});

	it("signOut still clears local state when the logout popup is dismissed", async () => {
		const auth = createAuth();
		mockLoginPopup.mockResolvedValue({ account: FAKE_ACCOUNT });
		mockLogoutPopup.mockRejectedValue(new Error("user_cancelled"));
		await auth.signIn();
		await auth.signOut(); // must not throw
		expect(mockClearCache).toHaveBeenCalled();
		expect(mockSetActiveAccount).toHaveBeenLastCalledWith(null);
	});

	it("never embeds token values in thrown error messages", async () => {
		const auth = createAuth();
		mockLoginPopup.mockResolvedValue({ account: FAKE_ACCOUNT });
		mockGetActiveAccount.mockReturnValue(FAKE_ACCOUNT);
		const leaky = new Error("secret-token-value-12345 was rejected");
		mockAcquireTokenSilent.mockRejectedValue(leaky);
		await auth.signIn();
		try {
			await auth.getToken();
			expect.unreachable("getToken should have thrown");
		} catch (e) {
			expect((e as Error).message).not.toContain("secret-token-value-12345");
		}
	});
});
