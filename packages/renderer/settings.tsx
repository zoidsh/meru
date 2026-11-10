import { useLingui } from "@lingui/react/macro";
import { ScrollArea } from "@meru/ui/components/scroll-area";
import { Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { AppMenuButton } from "@/components/app-menu-button";
import { AppSidebar, sidebarNavItems } from "@/components/app-sidebar";
import { AppToaster } from "@/components/app-toaster";
import { Titlebar, TitlebarTitle } from "@/components/titlebar";
import { renderApp } from "@/lib/react";
import "@/lib/ipc";

function Settings() {
  const { t } = useLingui();

  return (
    <Router hook={useHashLocation}>
      <div className="flex h-screen flex-col overflow-hidden">
        <Titlebar>
          <TitlebarTitle>
            {t({ message: "Settings", comment: "Title of the Settings window, in its titlebar" })}
          </TitlebarTitle>
          <AppMenuButton className="ml-auto" />
        </Titlebar>
        <div className="flex flex-1 overflow-hidden">
          <AppSidebar />
          <div className="relative flex flex-1 bg-sidebar">
            <ScrollArea className="@container relative m-4 flex-1 overflow-hidden rounded-xl border bg-background dark:border-none">
              <div className="mx-auto w-full max-w-3xl px-8 py-8 @xl:px-20 @3xl:px-28">
                {sidebarNavItems
                  .filter((navItem) => navItem.type !== "separator")
                  .map(({ path, component }) => (
                    <Route key={path} path={path} component={component} />
                  ))}
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
      <AppToaster />
    </Router>
  );
}

renderApp(Settings);
