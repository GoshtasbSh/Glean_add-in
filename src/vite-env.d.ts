/// <reference types="vite/client" />

// Injected at build time by vite.config.ts (define). In CI this is the short
// git SHA of the deployed commit; "local" for local builds. Shown in Settings
// so users (and we) can confirm exactly which build is loaded.
declare const __APP_BUILD__: string;
