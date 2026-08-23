import { cn } from "@meru/ui/lib/utils";
import { useEffect, useRef, useState } from "react";
import { renderApp } from "@/lib/react";
import { playgroundComponents } from "./components";
import { PLAYGROUND_SEARCH_PARAMS } from "./constants";
import { applyScenario, emitRendererEvent, onIpcCall, pushScenarioEvent } from "./fake-electron";
import { isShellMessage, type PreviewMessage } from "./messages";
import { playgroundComponentRenderers } from "./render";
import { scenarios } from "./scenarios";
import type { Scenario } from "./types";

const searchParams = new URLSearchParams(window.location.search);

const scenarioId = searchParams.get(PLAYGROUND_SEARCH_PARAMS.scenario);

const scenario = scenarios.find((candidate) => candidate.id === scenarioId) ?? scenarios[0];

if (!scenario) {
  throw new Error("The playground has no scenarios to render");
}

// Before anything reads the config or the stores, and so before `renderApp`.
applyScenario(scenario);

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

renderApp(() => <Preview scenario={scenario} />);
