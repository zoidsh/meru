import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { trpcClient, TrpcProvider } from "./lib/trpc";
import { queryClient } from "./lib/react-query";
import { AppTitlebar } from "./components/app-titlebar";
import { AppSidebar } from "./components/app-sidebar";
import { AppMain } from "./components/app-main";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

const root = createRoot(rootElement);

root.render(
  <TrpcProvider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <div className="flex flex-col h-screen">
        <AppTitlebar />
        <div className="flex-1 flex overflow-hidden">
          <AppSidebar />
          <AppMain />
        </div>
      </div>
    </QueryClientProvider>
  </TrpcProvider>
);
