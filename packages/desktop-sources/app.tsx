import { ipcMain } from "@meru/renderer-lib/ipc";
import type { DesktopSource, DesktopSources } from "@meru/shared/types";
import { Button } from "@meru/ui/components/button";
import { ScrollArea } from "@meru/ui/components/scroll-area";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@meru/ui/components/tabs";
import { cn } from "@meru/ui/lib/utils";
import { useEffect, useState } from "react";

export function App() {
	const [desktopSources, setDesktopSources] = useState<DesktopSources>([]);
	const [selectedDesktopSourceId, setSelectedDesktopSourceId] =
		useState<string>("");

	useEffect(() => {
		(async () => {
			setDesktopSources(await ipcMain.invoke("desktopSources"));
		})();
	}, []);

	const renderDesktopSources = (sources: DesktopSource[]) =>
		sources.map((window) => (
			<div
				key={window.id}
				className={cn(
					"px-3 py-2 border rounded-md text-sm transition hover:bg-accent select-none cursor-pointer",
					{
						"bg-accent text-accent-foreground font-semibold":
							selectedDesktopSourceId === window.id,
					},
				)}
				onClick={() => {
					setSelectedDesktopSourceId(window.id);
				}}
			>
				<div className="aspect-square flex justify-center items-center">
					<img src={window.thumbnail} alt={window.name} className="w-full" />
				</div>
				<div className="whitespace-nowrap truncate">{window.name}</div>
			</div>
		));

	const screens: DesktopSources = [];
	const windows: DesktopSources = [];

	for (const desktopSource of desktopSources) {
		(desktopSource.id.startsWith("screen") ? screens : windows).push(
			desktopSource,
		);
	}

	return (
		<div className="h-screen flex flex-col">
			<Tabs defaultValue="windows" className="flex-1 overflow-hidden gap-0">
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
			<div className="px-4 py-3.5 flex gap-4 justify-end border-t">
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

						ipcMain.send("selectDesktopSource", selectedDesktopSource);
					}}
				>
					Share
				</Button>
			</div>
		</div>
	);
}
