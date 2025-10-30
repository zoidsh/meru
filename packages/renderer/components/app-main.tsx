import { ipc } from "@meru/renderer-lib/ipc";
import { Button } from "@meru/ui/components/button";
import { XIcon } from "lucide-react";
import { useHotkeys } from "react-hotkeys-hook";
import { Route, Router } from "wouter";
import { navigate, useHashLocation } from "wouter/use-hash-location";
import { useSettingsStore } from "@/lib/stores";
import { Accounts } from "@/routes/accounts";
import { DownloadHistory } from "@/routes/download-history";
import { License } from "@/routes/license";
import { SavedSearches } from "@/routes/saved-searches";
import { NotificationsSettings } from "@/routes/settings/notifications";
import { VerificationCodes } from "@/routes/verification-codes";
import { VersionHistory } from "@/routes/version-history";
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
		<div className="flex flex-col items-center gap-2">
			<Button
				variant="outline"
				size="icon"
				onClick={closeSettings}
				className="rounded-full"
			>
				<XIcon />
			</Button>
			<div className="text-muted-foreground text-xs font-semibold">ESC</div>
		</div>
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
					<div className="w-xl space-y-12">
						<Route path="/saved-searches" component={SavedSearches} />
						<Route path="/download-history" component={DownloadHistory} />
						<Route path="/verification-codes" component={VerificationCodes} />
						<Route path="/settings" nest>
							<Route path="/notifications" component={NotificationsSettings} />
						</Route>
						<Route path="/accounts" component={Accounts} />
						<Route path="/license" component={License} />
						<Route path="/version-history" component={VersionHistory} />
					</div>
					<div>
						<div className="sticky top-8">
							<CloseButton />
						</div>
					</div>
				</div>
			</div>
		</Router>
	);
}
