import { createContext, useContext } from "react";
import type { AccountInfo } from "@azure/msal-browser";

export interface AuthContextValue {
  account: AccountInfo | null;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  getToken(): Promise<string>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
