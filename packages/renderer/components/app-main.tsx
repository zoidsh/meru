import { ipc } from "@meru/renderer-lib/ipc";
import { APP_TITLEBAR_HEIGHT } from "@meru/shared/constants";
import { Button } from "@meru/ui/components/button";
import { ScrollArea } from "@meru/ui/components/scroll-area";
import { XIcon } from "lucide-react";
import { useHotkeys } from "react-hotkeys-hook";
import { Route, Router, Switch } from "wouter";
import { navigate, useHashLocation } from "wouter/use-hash-location";
import { Accounts } from "@/routes/accounts";
import { DownloadHistory } from "@/routes/download-history";
import { Home } from "@/routes/home";
import { License } from "@/routes/license";
import { AppSidebar } from "./app-sidebar";

ipc.renderer.on("navigate", (_event, to) => {
	navigate(to);
});

function CloseButton() {
	const [_location, navigate] = useHashLocation();

	const closeSettings = () => {
		ipc.main.send("accounts.show");

		navigate("/");
	};

	useHotkeys("esc", closeSettings);

	return (
		<Button variant="secondary" size="icon" onClick={closeSettings}>
			<XIcon />
		</Button>
	);
}

export function AppMain() {
	return (
		<ScrollArea
			style={{
				marginTop: APP_TITLEBAR_HEIGHT,
				height: `calc(100vh - ${APP_TITLEBAR_HEIGHT}px)`,
			}}
		>
			<Router hook={useHashLocation}>
				<Switch>
					<Route path="/home" component={Home} />
					<div className="relative flex-1 overflow-y-auto px-4">
						<div className="flex justify-center gap-12 py-8">
							<AppSidebar />
							<div className="w-2xl space-y-6">
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
				</Switch>
			</Router>
		</ScrollArea>
	);
}
