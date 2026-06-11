import type { AccountInfo } from "@azure/msal-browser";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { auth } from "./msal";
import { AuthContext, type AuthContextValue } from "./useAuth";

export function AuthProvider({ children }: { children: ReactNode }) {
	const [account, setAccount] = useState<AccountInfo | null>(auth.getAccount());

	const signIn = useCallback(async () => {
		setAccount(await auth.signIn());
	}, []);
	const signOut = useCallback(async () => {
		await auth.signOut();
		setAccount(null);
	}, []);
	const getToken = useCallback(() => auth.getToken(), []);

	const value: AuthContextValue = useMemo(
		() => ({ account, signIn, signOut, getToken }),
		[account, signIn, signOut, getToken],
	);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
