import { QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { AppMain } from "./components/app-main";
import { AppSidebar } from "./components/app-sidebar";
import { AppTitlebar } from "./components/app-titlebar";
import { queryClient } from "./lib/react-query";

const rootElement = document.getElementById("root");

if (!rootElement) {
	throw new Error("Root element not found");
}

const root = createRoot(rootElement);

root.render(
	<QueryClientProvider client={queryClient}>
		<div className="flex flex-col h-screen">
			<AppTitlebar />
			<div className="flex-1 flex overflow-hidden">
				<AppSidebar />
				<AppMain />
			</div>
		</div>
	</QueryClientProvider>,
);
