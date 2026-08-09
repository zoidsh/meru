import type { TabState } from "@meru/shared/tabs";
import { GlobeIcon } from "lucide-react";
import { WorkspaceAppIcon } from "@/components/workspace-app-icon";

export function TabIcon({ app }: { app: TabState["app"] }) {
  if (app && app !== "myaccount") {
    return <WorkspaceAppIcon app={app} className="size-4" />;
  }

  return <GlobeIcon />;
}
