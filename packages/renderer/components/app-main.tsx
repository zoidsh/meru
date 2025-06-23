import { ipc } from "@meru/renderer-lib/ipc";
import { APP_TITLEBAR_HEIGHT } from "@meru/shared/constants";
import { Button } from "@meru/ui/components/button";
import { XIcon } from "lucide-react";
import { useHotkeys } from "react-hotkeys-hook";
import { Route, Router } from "wouter";
import { navigate, useHashLocation } from "wouter/use-hash-location";
import { useSettingsStore } from "@/lib/stores";
import { Accounts } from "@/routes/accounts";
import { DownloadHistory } from "@/routes/download-history";
import { License } from "@/routes/license";
import { AppSidebar } from "./app-sidebar";

ipc.renderer.on("navigate", (_event, to) => {
	navigate(to);
});

function CloseButton() {
	const closeSettings = () => {
		ipc.main.send("settings.toggleIsOpen");
	};

	useHotkeys("esc", closeSettings);

	return (
		<Button variant="secondary" size="icon" onClick={closeSettings}>
			<XIcon />
		</Button>
	);
}

export function AppMain() {
	const isSettingsOpen = useSettingsStore((state) => state.isOpen);

	if (!isSettingsOpen) {
		return;
	}

	return (
		<Router hook={useHashLocation}>
			<div className="relative flex-1 overflow-y-auto px-4">
				<div className="flex justify-center gap-12 py-8">
					<AppSidebar />
					<div className="w-xl space-y-6">
						<Route path="/download-history" component={DownloadHistory} />
						<Route path="/accounts" component={Accounts} />
						<Route path="/license" component={License} />
					</div>
				</div>
				<div
					className="fixed top-8 right-8"
					style={{ marginTop: APP_TITLEBAR_HEIGHT }}
				>
					<CloseButton />
				</div>
			</div>
		</Router>
	);
}
