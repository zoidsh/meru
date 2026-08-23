import { Badge } from "@meru/ui/components/badge";
import { Button } from "@meru/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@meru/ui/components/empty";
import { Field, FieldLabel } from "@meru/ui/components/field";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@meru/ui/components/item";
import { ScrollArea } from "@meru/ui/components/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@meru/ui/components/select";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@meru/ui/components/sidebar";
import { Switch } from "@meru/ui/components/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@meru/ui/components/table";
import { CableIcon, RotateCwIcon } from "lucide-react";
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

/**
 * One `SidebarGroup` per call site, its scenarios the menu under it. The active
 * entry and the hover and focus rings come from the sidebar's own parts.
 *
 * It collapses off-canvas rather than to icons, which is the default: a
 * scenario is named and has no icon, so icon mode would leave a column of blank
 * squares. Collapsing it hands the whole window to the preview.
 */
function ScenarioList({
  scenarioId,
  onSelect,
}: {
  scenarioId: string;
  onSelect: (scenarioId: string) => void;
}) {
  const componentIds = Object.keys(playgroundComponents) as (keyof typeof playgroundComponents)[];

  return (
    <SidebarContent>
      {componentIds.map((componentId) => (
        <SidebarGroup key={componentId}>
          <SidebarGroupLabel>{playgroundComponents[componentId].name}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {scenarios
                .filter((scenario) => scenario.component === componentId)
                .map((scenario) => (
                  <SidebarMenuItem key={scenario.id}>
                    <SidebarMenuButton
                      isActive={scenario.id === scenarioId}
                      onClick={() => {
                        onSelect(scenario.id);
                      }}
                    >
                      <span>{scenario.name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </SidebarContent>
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
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CableIcon />
              </EmptyMedia>
              <EmptyTitle>Nothing asked for yet</EmptyTitle>
              <EmptyDescription>
                Every send and invoke the component makes shows up here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20 pl-4">Kind</TableHead>
                <TableHead className="w-72">Channel</TableHead>
                <TableHead className="pr-4">Arguments</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calls.map((call) => (
                <TableRow key={call.id}>
                  <TableCell className="pl-4">
                    <Badge variant={call.kind === "send" ? "secondary" : "outline"}>
                      {call.kind}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {call.unanswered ? (
                      <Badge variant="destructive" title="No scenario answers this channel">
                        {call.channel}
                      </Badge>
                    ) : (
                      call.channel
                    )}
                  </TableCell>
                  <TableCell className="max-w-0 truncate pr-4 font-mono text-xs text-muted-foreground">
                    {call.args.map((argument) => JSON.stringify(argument)).join(", ")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
    <SidebarProvider className="h-screen min-h-0">
      <Sidebar>
        <SidebarHeader>
          <Item size="xs">
            <ItemContent>
              <ItemTitle>Component playground</ItemTitle>
              <ItemDescription>Meru's components over a fake preload bridge</ItemDescription>
            </ItemContent>
          </Item>
        </SidebarHeader>
        <ScenarioList scenarioId={scenarioId} onSelect={selectScenario} />
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-w-0 overflow-hidden">
        <div className="border-b">
          <Item>
            <SidebarTrigger />
            <ItemContent className="min-w-0">
              <ItemTitle>{scenario?.name}</ItemTitle>
              <ItemDescription>{scenario?.description}</ItemDescription>
            </ItemContent>
            <ItemActions className="gap-4">
              <Field orientation="horizontal" className="w-fit">
                <FieldLabel htmlFor="dark-mode">Dark mode</FieldLabel>
                <Switch id="dark-mode" checked={darkMode} onCheckedChange={toggleDarkMode} />
              </Field>
              <Field orientation="horizontal" className="w-fit">
                <FieldLabel htmlFor="platform">Platform</FieldLabel>
                <Select
                  items={platformItems}
                  value={platform}
                  onValueChange={(value) => {
                    if (value) {
                      selectPlatform(value as PlaygroundPlatform);
                    }
                  }}
                >
                  <SelectTrigger id="platform" className="w-32">
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
              </Field>
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
            </ItemActions>
          </Item>
        </div>
        <iframe
          key={previewKey}
          ref={previewRef}
          src={previewSource}
          title="Component preview"
          className="min-h-0 flex-1 border-0"
        />
        <CallLog calls={calls} />
      </SidebarInset>
    </SidebarProvider>
  );
}

const rootElement = document.getElementById("root");

if (rootElement) {
  createRoot(rootElement).render(<Shell />);
}
