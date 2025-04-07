import { APP_TITLEBAR_HEIGHT } from "@/lib/constants";
import { XIcon } from "lucide-react";
import { useIsSettingsOpen } from "../lib/hooks";
import { ipcMain } from "../lib/ipc";
import { Accounts } from "./accounts";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";

export function AppMain() {
	const isSettingsOpen = useIsSettingsOpen();

	if (isSettingsOpen.data !== true) {
		return;
	}

	return (
		<ScrollArea
			className="h-full"
			style={{ height: `calc(100vh - ${APP_TITLEBAR_HEIGHT}px)` }}
		>
			<div
				className="max-w-md mx-auto"
				style={{
					padding: `${APP_TITLEBAR_HEIGHT}px 0`,
				}}
			>
				<Accounts />
			</div>
			<Button
				variant="ghost"
				size="icon"
				className="size-7 absolute top-1.5 right-2"
				onClick={() => {
					ipcMain.send("toggleIsSettingsOpen");
				}}
			>
				<XIcon />
			</Button>
		</ScrollArea>
	);
}
