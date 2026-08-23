import { cn } from "@meru/ui/lib/utils";
import { useEffect, useRef, useState } from "react";
import { renderApp } from "@/lib/react";
import { playgroundComponents } from "./components";
import {
  emitRendererEvent,
  onIpcCall,
  playgroundScenario,
  pushScenarioEvent,
} from "./fake-electron";
import { isShellMessage, type PreviewMessage } from "./messages";
import { playgroundComponentRenderers } from "./render";
import type { Scenario } from "./types";

onIpcCall((call) => {
  const message: PreviewMessage = { type: "ipcCall", call };

  window.parent.postMessage(message, window.location.origin);
});

window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin || !isShellMessage(event.data)) {
    return;
  }

  emitRendererEvent("theme.darkModeChanged", [event.data.darkMode]);
});

function Preview({ scenario }: { scenario: Scenario }) {
  const { layout } = playgroundComponents[scenario.component];

  const containerRef = useRef<HTMLDivElement>(null);

  const [rendersNothing, setRendersNothing] = useState(false);

  useEffect(() => {
    for (const event of scenario.events ?? []) {
      pushScenarioEvent(event);
    }
  }, [scenario]);

  // Whether the component drew anything is only knowable from the DOM, and it
  // changes with every render rather than only on mount, so this has no
  // dependencies on purpose. React bails out when the value is unchanged.
  useEffect(() => {
    const container = containerRef.current;

    setRendersNothing(
      container !== null && container.childElementCount === 0 && !container.textContent,
    );
  });

  return (
    <div className="flex h-screen flex-col">
      <div
        ref={containerRef}
        className={cn("flex-1", layout === "padded" ? "overflow-auto p-6" : "flex overflow-hidden")}
      >
        {playgroundComponentRenderers[scenario.component]()}
      </div>
      {rendersNothing && (
        <div className="border-t px-6 py-3 text-sm text-muted-foreground">
          This component renders nothing in this scenario.
        </div>
      )}
    </div>
  );
}

renderApp(() => <Preview scenario={playgroundScenario} />);
