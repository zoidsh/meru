import { I18nProvider } from "@meru/i18n/provider";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./lib/notifications";
import "./dark-mode";
import "./ipc";

const rootElement = document.getElementById("root");

if (rootElement) {
  const root = createRoot(rootElement);

  root.render(
    <I18nProvider>
      <App />
    </I18nProvider>,
  );
}
