import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@meru/ui/components/empty";
import { cn } from "@meru/ui/lib/utils";
import { EyeOffIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { renderApp } from "@/lib/react";
import { type PlaygroundComponent, playgroundComponents } from "./components";
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

/** How the preview frames each of the catalog's layouts. */
const PREVIEW_LAYOUT_CLASS_NAMES = {
  padded: "overflow-auto p-6",
  fill: "flex overflow-hidden",
  flush: "overflow-auto",
} satisfies Record<PlaygroundComponent["layout"], string>;

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
      <div ref={containerRef} className={cn("flex-1", PREVIEW_LAYOUT_CLASS_NAMES[layout])}>
        {playgroundComponentRenderers[scenario.component]()}
      </div>
      {rendersNothing && (
        <Empty className="flex-none border-t">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <EyeOffIcon />
            </EmptyMedia>
            <EmptyTitle>Nothing rendered</EmptyTitle>
            <EmptyDescription>
              This component draws nothing in this scenario, which is a state of its own rather than
              a failure.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}

renderApp(() => <Preview scenario={playgroundScenario} />);
