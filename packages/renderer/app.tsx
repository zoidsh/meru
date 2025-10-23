import { Toaster } from "@meru/ui/components/sonner";
import { TooltipProvider } from "@meru/ui/components/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { AppMain } from "@/components/app-main";
import { AppTitlebar } from "@/components/app-titlebar";
import { useMouseAccountSwitching } from "./lib/hooks";
import { queryClient } from "./lib/react-query";
import { useThemeStore } from "./lib/stores";

export function App() {
	const theme = useThemeStore((state) => state.theme);

	useMouseAccountSwitching();

	return (
		<QueryClientProvider client={queryClient}>
			<TooltipProvider>
				<div className="h-screen flex flex-col">
					<AppTitlebar />
					<AppMain />
				</div>
				<Toaster theme={theme} />
			</TooltipProvider>
		</QueryClientProvider>
	);
}
