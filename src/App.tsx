// FreeMode is the primary pane: works inside Outlook with NO Microsoft Graph,
// NO Entra registration, NO admin consent. The Graph-mode demo (MSAL/OneDrive)
// stays reachable at ?graph for testing the Graph path once UFIT enables it
// (Phase 3). A later session does the real, designed UI.
import FreeMode from "./FreeMode";
import GraphDemo from "./GraphDemo";

export default function App() {
	const useGraph =
		typeof window !== "undefined" && window.location.search.includes("graph");
	return useGraph ? <GraphDemo /> : <FreeMode />;
}
