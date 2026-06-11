import { useState, type ReactNode } from "react";
import type { AccountInfo } from "@azure/msal-browser";
import { auth } from "./msal";
import { AuthContext, type AuthContextValue } from "./useAuth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<AccountInfo | null>(auth.getAccount());

  const value: AuthContextValue = {
    account,
    async signIn() {
      setAccount(await auth.signIn());
    },
    async signOut() {
      await auth.signOut();
      setAccount(null);
    },
    getToken: () => auth.getToken(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
