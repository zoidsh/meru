import { Toaster } from "@meru/ui/components/sonner";
import { TooltipProvider } from "@meru/ui/components/tooltip";
import { AppMain } from "@/components/app-main";
import { AppTitlebar } from "@/components/app-titlebar";
import { useMouseAccountSwitching } from "./lib/hooks";
import { useThemeStore } from "./lib/stores";

export function App() {
	const theme = useThemeStore((state) => state.theme);

	useMouseAccountSwitching();

	return (
		<TooltipProvider>
			<div className="h-screen flex flex-col">
				<AppTitlebar />
				<AppMain />
			</div>
			<Toaster theme={theme} />
		</TooltipProvider>
	);
}
