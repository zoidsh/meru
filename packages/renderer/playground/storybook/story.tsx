import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@meru/ui/components/empty";
import { cn } from "@meru/ui/lib/utils";
import type { StoryObj } from "@storybook/react-vite";
import { EyeOffIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { playgroundComponents } from "../components";
import { applyScenario, pushScenarioEvent } from "../fake-electron";
import { playgroundComponentRenderers } from "../render";
import { scenarios } from "../scenarios";
import type { Scenario } from "../types";
import { resetRendererState } from "./reset";

function ScenarioPreview({ scenario }: { scenario: Scenario }) {
  const { layout } = playgroundComponents[scenario.component];

  const containerRef = useRef<HTMLDivElement>(null);

  const [rendersNothing, setRendersNothing] = useState(false);

  useEffect(() => {
    for (const event of scenario.events ?? []) {
      pushScenarioEvent(event);
    }
  }, [scenario]);

  /**
   * Whether the component drew anything is only knowable from the DOM, and it
   * is the component's own state that decides — a resolved query, a pushed
   * event — which never re-renders this one. Watching the container is what
   * makes the answer arrive whenever the component changes its mind, rather
   * than only when this component happens to render.
   */
  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const readContainer = () => {
      setRendersNothing(container.childElementCount === 0 && !container.textContent);
    };

    const observer = new MutationObserver(readContainer);

    observer.observe(container, { childList: true, subtree: true, characterData: true });

    readContainer();

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div className="flex h-screen flex-col">
      <div
        ref={containerRef}
        className={cn("flex-1", layout === "padded" ? "overflow-auto p-6" : "flex overflow-hidden")}
      >
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

/**
 * Turns one scenario into one story. The generated catalog modules call this,
 * which is what keeps `scenarios.ts` the only place a scenario is written down
 * — see `stories.ts` for how the modules are generated and indexed.
 */
export function createScenarioStory(scenarioId: string, storyId: string): StoryObj {
  const scenario = scenarios.find((candidate) => candidate.id === scenarioId);

  if (!scenario) {
    throw new Error(`The playground has no scenario named ${scenarioId}`);
  }

  return {
    name: scenario.name,
    parameters: {
      __id: storyId,
      layout: "fullscreen",
      docs: { description: { story: scenario.description } },
    },
    /**
     * Storybook swaps stories without reloading the page, so the fake's answers
     * and everything the last scenario pushed into the stores and the query
     * cache have to be put back before this one renders.
     */
    beforeEach: () => {
      resetRendererState();

      applyScenario(scenario);
    },
    render: () => <ScenarioPreview scenario={scenario} />,
  };
}
