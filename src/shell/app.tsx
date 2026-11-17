import { useLingui } from "@lingui/react/macro";
import type { CSSProperties } from "react";

import { viewFrame } from "#core/layout.ts";
import { TooltipProvider } from "#ui/tooltip.tsx";

import { Inbox } from "./inbox.tsx";
import { OverlayLayer } from "./overlay.tsx";
import { useShellState } from "./sync.ts";
import { Sidebar, TabProblem } from "./tab-strip.tsx";
import { Titlebar } from "./titlebar.tsx";

export const App = () => {
  const { t } = useLingui();
  const tabs = useShellState("tabs");
  const profiles = useShellState("profiles");
  const inbox = useShellState("inbox");
  const sidebar = useShellState("sidebar")?.state ?? "hidden";
  const { inset, radius } = viewFrame(sidebar);
  const selected = profiles?.profiles.find(
    (profile) => profile.id === profiles.selectedProfileId
  );

  return (
    <TooltipProvider>
      {/* The selected profile's colour, which `styles.css` mixes into the shell's greys. */}
      <div
        data-tint
        style={{ "--tint": selected?.color } as CSSProperties}
        className="flex h-full flex-col bg-shell"
      >
        <Titlebar sidebarShown={sidebar !== "hidden"} />
        <div className="flex min-h-0 flex-1">
          {tabs && sidebar !== "hidden" && (
            <Sidebar
              tabs={tabs}
              state={sidebar}
              unreadCount={selected?.mail.unreadCount ?? 0}
            />
          )}
          {/* Drawn where main places the view, by the same measurements. */}
          <main
            aria-label={t({
              message: "Content",
              comment:
                "Accessible name of the window's main area, below the title bar, read by screen readers",
            })}
            style={{
              paddingTop: inset.top,
              paddingRight: inset.right,
              paddingBottom: inset.bottom,
              paddingLeft: inset.left,
            }}
            className="flex min-w-0 flex-1"
          >
            <div
              style={{ borderRadius: radius }}
              className="min-w-0 flex-1 overflow-hidden bg-background"
            >
              {inbox?.open ? (
                <Inbox inbox={inbox} />
              ) : (
                tabs && <TabProblem tabs={tabs} />
              )}
            </div>
          </main>
        </div>
        <OverlayLayer />
      </div>
    </TooltipProvider>
  );
};
