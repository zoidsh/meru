import { ipc } from "@meru/shared/renderer/ipc";
import type { DesktopSource, DesktopSources } from "@meru/shared/types";
import { Button } from "@meru/ui/components/button";
import { ScrollArea } from "@meru/ui/components/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@meru/ui/components/tabs";
import { cn } from "@meru/ui/lib/utils";
import { useEffect, useState } from "react";

export function DesktopSources() {
  const [desktopSources, setDesktopSources] = useState<DesktopSources>([]);
  const [selectedDesktopSourceId, setSelectedDesktopSourceId] = useState<string>("");

  useEffect(() => {
    (async () => {
      setDesktopSources(await ipc.main.invoke("desktopSources.getSources"));
    })();
  }, []);

  const renderDesktopSources = (sources: DesktopSource[]) =>
    sources.map((window) => (
      <div
        key={window.id}
        className={cn(
          "rounded-md border px-3 py-2 text-sm transition select-none hover:bg-accent",
          {
            "bg-accent font-semibold text-accent-foreground": selectedDesktopSourceId === window.id,
          },
        )}
        onClick={() => {
          setSelectedDesktopSourceId(window.id);
        }}
      >
        <div className="flex aspect-square items-center justify-center">
          <img src={window.thumbnail} alt={window.name} className="w-full" />
        </div>
        <div className="truncate whitespace-nowrap">{window.name}</div>
      </div>
    ));

  const screens: DesktopSources = [];
  const windows: DesktopSources = [];

  for (const desktopSource of desktopSources) {
    (desktopSource.id.startsWith("screen") ? screens : windows).push(desktopSource);
  }

  return (
    <div className="flex h-screen flex-col">
      <Tabs defaultValue="windows" className="flex-1 gap-0 overflow-hidden">
        <div className="border-b px-4 py-3.5">
          <TabsList className="w-full">
            <TabsTrigger value="windows">Windows</TabsTrigger>
            <TabsTrigger value="screens">Screens</TabsTrigger>
          </TabsList>
        </div>
        <ScrollArea className="flex-1 overflow-hidden">
          <TabsContent value="windows" className="grid grid-cols-3 gap-4 p-4">
            {renderDesktopSources(windows)}
          </TabsContent>
          <TabsContent value="screens" className="grid grid-cols-3 gap-4 p-4">
            {renderDesktopSources(screens)}
          </TabsContent>
        </ScrollArea>
      </Tabs>
      <div className="flex justify-end gap-4 border-t px-4 py-3.5">
        <Button
          variant="outline"
          onClick={() => {
            window.close();
          }}
        >
          Cancel
        </Button>
        <Button
          disabled={!selectedDesktopSourceId}
          onClick={() => {
            const selectedDesktopSource = desktopSources.find(
              (source) => source.id === selectedDesktopSourceId,
            );

            if (!selectedDesktopSource) {
              throw new Error("Couldn't find selected desktop source");
            }

            ipc.main.send("desktopSources.select", selectedDesktopSource);
          }}
        >
          Share
        </Button>
      </div>
    </div>
  );
}
