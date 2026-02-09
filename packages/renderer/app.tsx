import { ipc } from "@meru/renderer-lib/ipc";
import { Toaster } from "@meru/ui/components/sonner";
import { TooltipProvider } from "@meru/ui/components/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { AppMain } from "@/components/app-main";
import { AppTitlebar } from "@/components/app-titlebar";
import { AppSidebar } from "./components/app-sidebar";
import { useAccountsStore } from "./lib/accounts";
import { useMouseAccountSwitching } from "./lib/hooks";
import { queryClient } from "./lib/react-query";
import { useThemeStore } from "./lib/stores";

export function App() {
	const theme = useThemeStore((state) => state.theme);

	useMouseAccountSwitching();

	useEffect(() => {
		const init = async () => {
			await useAccountsStore.getState().initAccounts();

			ipc.main.send("renderer.ready");
		};

		init();
	}, []);

	return (
		<QueryClientProvider client={queryClient}>
			<TooltipProvider>
				<Router hook={useHashLocation}>
					<div className="h-screen flex flex-col">
						<AppTitlebar />
						<div className="flex-1 flex overflow-hidden">
							<AppSidebar />
							<AppMain />
						</div>
					</div>
					<Toaster theme={theme} />
				</Router>
			</TooltipProvider>
		</QueryClientProvider>
	);
}
