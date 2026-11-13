import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { rendererSurface } from "../../shared/channels/surfaces.ts";
import { ChromeProvider, createChrome } from "../chrome-context.tsx";
import { createClient } from "../client.ts";
import { Sidebar } from "../features/sidebar/sidebar.tsx";
import { Dividers } from "../features/stage/dividers.tsx";
import { Titlebar } from "../features/titlebar/titlebar.tsx";
import { followTheme } from "../theme.ts";

followTheme(document.documentElement, location.href, (query) =>
  matchMedia(query)
);

const chrome = createChrome(createClient(window, rendererSurface));

const root = document.querySelector("#root");

if (!root) {
  throw new Error("chrome.html has no #root to render into");
}

createRoot(root).render(
  <StrictMode>
    <ChromeProvider chrome={chrome}>
      <div className="bg-background text-foreground flex h-full flex-col">
        <Titlebar />
        <div className="flex min-h-0 flex-1">
          <Sidebar />
        </div>
      </div>
      <Dividers />
    </ChromeProvider>
  </StrictMode>
);
