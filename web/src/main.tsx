import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import "./styles/global.css";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("ApplyMate root element is missing.");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

async function removeLegacyOfflineShell(): Promise<void> {
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith("applymate-shell-"))
      .map((key) => caches.delete(key)));
  }
}

void removeLegacyOfflineShell();
