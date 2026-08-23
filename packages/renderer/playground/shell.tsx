import { Button } from "@meru/ui/components/button";
import { Label } from "@meru/ui/components/label";
import { ScrollArea } from "@meru/ui/components/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@meru/ui/components/select";
import { Switch } from "@meru/ui/components/switch";
import { cn } from "@meru/ui/lib/utils";
import { RotateCwIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { playgroundComponents } from "./components";
import {
  getPlaygroundPlatform,
  PLAYGROUND_SEARCH_PARAMS,
  type PlaygroundPlatform,
  playgroundPlatforms,
} from "./constants";
import { isPreviewMessage, type ShellMessage } from "./messages";
import { scenarios } from "./scenarios";
import type { IpcCall } from "./types";

/** How many calls the log keeps before the oldest fall off the top. */
const MAX_LOGGED_CALLS = 100;

const platformItems = Object.entries(playgroundPlatforms).map(([value, label]) => ({
  value,
  label,
}));

const shellSearchParams = new URLSearchParams(window.location.search);

const initialScenarioId =
  scenarios.find(
    (scenario) => scenario.id === shellSearchParams.get(PLAYGROUND_SEARCH_PARAMS.scenario),
  )?.id ??
  scenarios[0]?.id ??
  "";

const initialPlatform = getPlaygroundPlatform(shellSearchParams);

const initialDarkMode = shellSearchParams.get(PLAYGROUND_SEARCH_PARAMS.darkMode) === "true";

function buildPreviewSource({
  scenarioId,
  platform,
  darkMode,
}: {
  scenarioId: string;
  platform: PlaygroundPlatform;
  darkMode: boolean;
}): string {
  const previewSearchParams = new URLSearchParams({
    [PLAYGROUND_SEARCH_PARAMS.scenario]: scenarioId,
    [PLAYGROUND_SEARCH_PARAMS.platform]: platform,
    [PLAYGROUND_SEARCH_PARAMS.darkMode]: String(darkMode),
  });

  return `./preview.html?${previewSearchParams}`;
}

type LoggedCall = IpcCall & { id: number };

function ScenarioList({
  scenarioId,
  onSelect,
}: {
  scenarioId: string;
  onSelect: (scenarioId: string) => void;
}) {
  return (
    <ScrollArea className="flex-1">
      <div className="space-y-6 p-4">
        {Object.entries(playgroundComponents).map(([componentId, component]) => (
          <div key={componentId} className="space-y-1">
            <div className="px-2 text-xs font-semibold text-muted-foreground">{component.name}</div>
            {scenarios
              .filter((scenario) => scenario.component === componentId)
              .map((scenario) => (
                <button
                  key={scenario.id}
                  type="button"
                  onClick={() => {
                    onSelect(scenario.id);
                  }}
                  className={cn(
                    "block w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                    scenario.id === scenarioId
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted/50",
                  )}
                >
                  {scenario.name}
                </button>
              ))}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

function CallLog({ calls }: { calls: LoggedCall[] }) {
  return (
    <div className="flex h-56 flex-col border-t">
      <div className="border-b px-4 py-2 text-xs font-semibold text-muted-foreground">
        What the component asked the main process for
      </div>
      <ScrollArea className="flex-1">
        {calls.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">Nothing yet.</div>
        ) : (
          <div className="space-y-1 p-4 font-mono text-xs">
            {calls.map((call) => (
              <div key={call.id} className="flex gap-2">
                <span className="w-12 shrink-0 text-muted-foreground">{call.kind}</span>
                <span
                  className={cn("shrink-0", call.unanswered && "text-destructive")}
                  title={call.unanswered ? "No scenario answers this channel" : undefined}
                >
                  {call.channel}
                </span>
                <span className="truncate text-muted-foreground">
                  {call.args.map((argument) => JSON.stringify(argument)).join(", ")}
                </span>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function Shell() {
  const [scenarioId, setScenarioId] = useState(initialScenarioId);

  const [platform, setPlatform] = useState(initialPlatform);

  const [darkMode, setDarkMode] = useState(initialDarkMode);

  const [previewSource, setPreviewSource] = useState(() =>
    buildPreviewSource({
      scenarioId: initialScenarioId,
      platform: initialPlatform,
      darkMode: initialDarkMode,
    }),
  );

  const [reloadCount, setReloadCount] = useState(0);

  const [calls, setCalls] = useState<LoggedCall[]>([]);

  const previewRef = useRef<HTMLIFrameElement>(null);

  const previewKey = `${previewSource}#${reloadCount}`;

  useEffect(() => {
    setCalls([]);
  }, [previewKey]);

  useEffect(() => {
    let nextCallId = 0;

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !isPreviewMessage(event.data)) {
        return;
      }

      nextCallId += 1;

      const loggedCall = { ...event.data.call, id: nextCallId };

      setCalls((previousCalls) => [...previousCalls, loggedCall].slice(-MAX_LOGGED_CALLS));
    };

    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  useEffect(() => {
    window.history.replaceState(
      null,
      "",
      `?${new URLSearchParams({
        [PLAYGROUND_SEARCH_PARAMS.scenario]: scenarioId,
        [PLAYGROUND_SEARCH_PARAMS.platform]: platform,
        [PLAYGROUND_SEARCH_PARAMS.darkMode]: String(darkMode),
      })}`,
    );
  }, [scenarioId, platform, darkMode]);

  const selectScenario = (nextScenarioId: string) => {
    setScenarioId(nextScenarioId);

    setPreviewSource(buildPreviewSource({ scenarioId: nextScenarioId, platform, darkMode }));
  };

  const selectPlatform = (nextPlatform: PlaygroundPlatform) => {
    setPlatform(nextPlatform);

    setPreviewSource(buildPreviewSource({ scenarioId, platform: nextPlatform, darkMode }));
  };

  /**
   * Pushed rather than reloaded, because `theme.darkModeChanged` is a real
   * event and the preview's theme module listens for it. The URL still carries
   * the value, for the reload a scenario or platform change does cause.
   */
  const toggleDarkMode = (nextDarkMode: boolean) => {
    setDarkMode(nextDarkMode);

    const message: ShellMessage = { type: "darkMode", darkMode: nextDarkMode };

    previewRef.current?.contentWindow?.postMessage(message, window.location.origin);
  };

  const scenario = scenarios.find((candidate) => candidate.id === scenarioId);

  return (
    <div className="flex h-screen">
      <div className="flex w-72 flex-col border-r">
        <div className="border-b px-4 py-3">
          <div className="font-semibold">Component playground</div>
          <div className="text-xs text-muted-foreground">
            Meru's components over a fake preload bridge
          </div>
        </div>
        <ScenarioList scenarioId={scenarioId} onSelect={selectScenario} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-6 border-b px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{scenario?.name}</div>
            <div className="truncate text-xs text-muted-foreground" title={scenario?.description}>
              {scenario?.description}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="dark-mode">Dark mode</Label>
            <Switch id="dark-mode" checked={darkMode} onCheckedChange={toggleDarkMode} />
          </div>
          <Select
            items={platformItems}
            value={platform}
            onValueChange={(value) => {
              if (value) {
                selectPlatform(value as PlaygroundPlatform);
              }
            }}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {platformItems.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            title="Reload the preview"
            onClick={() => {
              setReloadCount((count) => count + 1);
            }}
          >
            <RotateCwIcon />
          </Button>
        </div>
        <iframe
          key={previewKey}
          ref={previewRef}
          src={previewSource}
          title="Component preview"
          className="min-h-0 flex-1 border-0"
        />
        <CallLog calls={calls} />
      </div>
    </div>
  );
}

const rootElement = document.getElementById("root");

if (rootElement) {
  createRoot(rootElement).render(<Shell />);
}
