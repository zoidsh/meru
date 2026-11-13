import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { rectSchema } from "../../core/records/rect.ts";
import { launcher } from "../../shared/channels/launcher.ts";
import { rendererSurface } from "../../shared/channels/surfaces.ts";
import { ChromeProvider, createChrome } from "../chrome-context.tsx";
import { createClient } from "../client.ts";
import { Launcher } from "../features/launcher/launcher.tsx";
import { followTheme } from "../theme.ts";

import "../ui/globals.css";

followTheme(document.documentElement, location.href, (query) =>
  matchMedia(query)
);

const client = createClient(window, rendererSurface);

const parseAnchor = (raw: string | null) => {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw ?? "null");
  } catch {
    parsed = null;
  }
  return rectSchema.safeParse(parsed).data;
};

const anchor = parseAnchor(new URL(location.href).searchParams.get("anchor"));
const root = document.querySelector("#root");

if (!root) {
  throw new Error("launcher.html has no #root to render into");
}

if (anchor === undefined) {
  client.send(launcher.close, {});
} else {
  createRoot(root).render(
    <StrictMode>
      <ChromeProvider chrome={createChrome(client)}>
        <Launcher anchor={anchor} />
      </ChromeProvider>
    </StrictMode>
  );
}
