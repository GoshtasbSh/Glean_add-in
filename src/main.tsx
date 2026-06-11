import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

const root = createRoot(document.getElementById("root")!);

// Fall back to standalone banner if Office.onReady never fires within 3 s
// (e.g. debugging the pane directly in a browser).
const standaloneFallback = setTimeout(() => {
  root.render(
    <StrictMode>
      <div
        style={{
          padding: 16,
          fontFamily: "sans-serif",
          color: "#555",
          fontSize: 14,
        }}
      >
        Not running inside Outlook. Open this add-in from the mail client.
      </div>
    </StrictMode>
  );
}, 3000);

try {
  Office.onReady(() => {
    clearTimeout(standaloneFallback);
    root.render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  });
} catch {
  // Office global unavailable — standalone timer will fire
}
