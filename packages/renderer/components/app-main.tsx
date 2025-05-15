import { ipcMain } from "@meru/renderer-lib/ipc";
import { APP_TITLEBAR_HEIGHT } from "@meru/shared/constants";
import { Button } from "@meru/ui/components/button";
import { ScrollArea } from "@meru/ui/components/scroll-area";
import { XIcon } from "lucide-react";
import { useSettingsStore } from "../lib/stores";
import { Accounts } from "./accounts";
import { LicenseKey } from "./license-key";

export function AppMain() {
	const isSettingsOpen = useSettingsStore((state) => state.isOpen);

	if (!isSettingsOpen) {
		return;
	}

	return (
		<ScrollArea
			className="h-full"
			style={{ height: `calc(100vh - ${APP_TITLEBAR_HEIGHT}px)` }}
		>
			<div
				className="max-w-md mx-auto space-y-10"
				style={{
					padding: `${APP_TITLEBAR_HEIGHT}px 0`,
				}}
			>
				<Accounts />
				<LicenseKey />
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
