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
  let pca: PublicClientApplication | null = null;

  async function instance(): Promise<PublicClientApplication> {
    if (pca) return pca;
    const clientId = import.meta.env.VITE_ENTRA_CLIENT_ID;
    const tenant = import.meta.env.VITE_ENTRA_TENANT_ID || "organizations";
    if (!clientId) {
      throw new Error("VITE_ENTRA_CLIENT_ID is not set — create addin/.env.local (see §3.3)");
    }
    pca = new PublicClientApplication({
      auth: {
        clientId,
        authority: `https://login.microsoftonline.com/${tenant}`,
        redirectUri: window.location.origin,
      },
      // Custody rule (OVERVIEW §2.2): tokens live in memory only, never in
      // localStorage/sessionStorage.
      cache: { cacheLocation: BrowserCacheLocation.MemoryStorage },
    });
    await pca.initialize();
    return pca;
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
          const result = await app.acquireTokenPopup({ scopes: GRAPH_SCOPES });
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
