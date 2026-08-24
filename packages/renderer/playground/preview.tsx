import { cn } from "@meru/ui/lib/utils";
import { useEffect } from "react";
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

  useEffect(() => {
    for (const event of scenario.events ?? []) {
      pushScenarioEvent(event);
    }
  }, [scenario]);

  return (
    <div
      className={cn("h-screen", layout === "padded" ? "overflow-auto p-6" : "flex overflow-hidden")}
    >
      {playgroundComponentRenderers[scenario.component]()}
    </div>
  );
}

renderApp(() => <Preview scenario={playgroundScenario} />);
