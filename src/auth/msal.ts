import {
  PublicClientApplication,
  InteractionRequiredAuthError,
  BrowserCacheLocation,
  type AccountInfo,
} from "@azure/msal-browser";
import { GRAPH_SCOPES } from "./scopes";

export interface Auth {
  signIn(): Promise<AccountInfo>;
  getToken(): Promise<string>;
  signOut(): Promise<void>;
  getAccount(): AccountInfo | null;
}

export function createAuth(): Auth {
  // Single in-flight promise so concurrent callers share one initialized
  // instance (loginPopup on an uninitialized PCA throws).
  let pcaPromise: Promise<PublicClientApplication> | null = null;
  let pca: PublicClientApplication | null = null;

  async function build(): Promise<PublicClientApplication> {
    const clientId = import.meta.env.VITE_ENTRA_CLIENT_ID;
    const tenant = import.meta.env.VITE_ENTRA_TENANT_ID || "organizations";
    if (!clientId) {
      throw new Error("VITE_ENTRA_CLIENT_ID is not set — create addin/.env.local (see §3.3)");
    }
    const app = new PublicClientApplication({
      auth: {
        clientId,
        authority: `https://login.microsoftonline.com/${tenant}`,
        redirectUri: window.location.origin,
      },
      // Custody rule (OVERVIEW §2.2): tokens live in memory only, never in
      // localStorage/sessionStorage.
      cache: { cacheLocation: BrowserCacheLocation.MemoryStorage },
    });
    await app.initialize();
    pca = app;
    return app;
  }

  function instance(): Promise<PublicClientApplication> {
    if (!pcaPromise) {
      pcaPromise = build().catch((e) => {
        pcaPromise = null; // allow retry after a transient failure
        throw e;
      });
    }
    return pcaPromise;
  }

  return {
    async signIn() {
      const app = await instance();
      const result = await app.loginPopup({ scopes: GRAPH_SCOPES });
      app.setActiveAccount(result.account);
      return result.account;
    },

    async getToken() {
      const app = await instance();
      const account = app.getActiveAccount();
      if (!account) throw new Error("Not signed in — call signIn() first");
      try {
        const result = await app.acquireTokenSilent({ scopes: GRAPH_SCOPES, account });
        return result.accessToken;
      } catch (e) {
        if (e instanceof InteractionRequiredAuthError) {
          const result = await app.acquireTokenPopup({ scopes: GRAPH_SCOPES, account });
          return result.accessToken;
        }
        // Never echo upstream error text — it could carry token material.
        // Deliberately no `cause`: attaching the original error would keep
        // that material reachable through the error chain.
        // eslint-disable-next-line preserve-caught-error
        throw new Error("Token acquisition failed (silent flow, non-interactive error)");
      }
    },

    async signOut() {
      const app = await instance();
      const account = app.getActiveAccount();
      try {
        // End the Entra session too — on a shared machine, clearing only the
        // local cache would let the next loginPopup SSO straight back in.
        await app.logoutPopup({ account: account ?? undefined });
      } catch {
        // popup dismissed/blocked — still clear local state below
      }
      await app.clearCache();
      app.setActiveAccount(null);
    },

    getAccount() {
      return pca?.getActiveAccount() ?? null;
    },
  };
}

// App-wide singleton; tests build their own via createAuth().
export const auth = createAuth();
