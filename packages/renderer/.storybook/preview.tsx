import { TooltipProvider } from "@meru/ui/components/tooltip";
import type { Preview } from "@storybook/react-vite";
import { QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect } from "react";
import { action } from "storybook/actions";
import { queryClient } from "@/lib/react-query";
import { initTheme } from "@/lib/theme";
import { playgroundPlatforms } from "../playground/constants";
import { emitRendererEvent, onIpcCall } from "../playground/fake-electron";
import "../globals.css";

/**
 * The fake bridge is installed by `main.ts`'s `previewAnnotations`, which
 * Storybook imports ahead of this file and of every story module. Nothing here
 * has to be ordered by hand, which is what the playground's own preview page
 * needed a second script tag for.
 */
initTheme();

/**
 * The renderer's own entry point wraps every page in these, so a story that
 * skipped them would be rendering something the app never renders.
 */
function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}

/**
 * Dark mode has a real event behind it, so the toolbar pushes
 * `theme.darkModeChanged` and the renderer's own theme module does the rest.
 */
function DarkMode({ darkMode, children }: { darkMode: boolean; children: ReactNode }) {
  useEffect(() => {
    emitRendererEvent("theme.darkModeChanged", [darkMode]);
  }, [darkMode]);

  return children;
}

/** What the fake answered for when the page loaded, which is what a story sees. */
const loadedPlatform = window.electron.process.platform;

/**
 * Rewrites one entry of the `globals` search parameter and leaves the rest of
 * the string exactly as it was. Storybook's own globals include objects, which
 * have no round-trippable form here, so the ones this file does not own are
 * never re-serialized.
 */
function withPlatformGlobal(search: URLSearchParams, platform: string): string {
  const entries = (search.get("globals") ?? "").split(";").filter(Boolean);

  const withoutPlatform = entries.filter((entry) => !entry.startsWith("platform:"));

  return [...withoutPlatform, `platform:${platform}`].join(";");
}

const logIpcCall = action("ipc");

onIpcCall((call) => {
  logIpcCall({
    kind: call.unanswered ? "invoke (unanswered)" : call.kind,
    channel: call.channel,
    args: call.args,
  });
});

export default {
  initialGlobals: {
    platform: "linux",
    darkMode: false,
  },
  globalTypes: {
    platform: {
      description: "What the fake bridge reports as `process.platform`",
      toolbar: {
        title: "Platform",
        items: Object.entries(playgroundPlatforms).map(([value, title]) => ({ value, title })),
      },
    },
    darkMode: {
      description: "Pushed as `theme.darkModeChanged`",
      toolbar: {
        title: "Theme",
        items: [
          { value: false, title: "Light" },
          { value: true, title: "Dark" },
        ],
      },
    },
  },
  /**
   * The renderer reads `process.platform` once as its modules evaluate, and
   * Storybook changes a global without reloading, so the platform is written
   * back into the preview's own URL and the page is loaded again. Storybook
   * only ever preserves the globals the URL already carried, which is why the
   * new value has to be put there rather than waited for.
   */
  beforeEach: ({ globals }) => {
    if (typeof globals.platform === "string" && globals.platform !== loadedPlatform) {
      const url = new URL(window.location.href);

      url.searchParams.set("globals", withPlatformGlobal(url.searchParams, globals.platform));

      window.location.replace(url);
    }
  },
  decorators: [
    (Story, { globals }) => (
      <Providers>
        <DarkMode darkMode={globals.darkMode === true}>
          <Story />
        </DarkMode>
      </Providers>
    ),
  ],
} satisfies Preview;
