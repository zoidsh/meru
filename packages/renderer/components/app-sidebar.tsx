import { Button } from "@meru/ui/components/button";
import { ScrollArea } from "@meru/ui/components/scroll-area";
import { Separator } from "@meru/ui/components/separator";
import { cn } from "@meru/ui/lib/utils";
import { type RouteProps, useLocation } from "wouter";
import { useSettingsStore } from "@/lib/stores";
import { platform } from "@/lib/utils";
import { DownloadHistory } from "@/routes/download-history";
import { AboutSettings } from "@/routes/settings/about";
import { AccountsSettings } from "@/routes/settings/accounts";
import { AdvancedSettings } from "@/routes/settings/advanced";
import { AppearanceSettings } from "@/routes/settings/appearance";
import { BlockerSettings } from "@/routes/settings/blocker";
import { DownloadsSettings } from "@/routes/settings/downloads";
import { GeneralSettings } from "@/routes/settings/general";
import { GmailSettings } from "@/routes/settings/gmail";
import { LanguagesSettings } from "@/routes/settings/languages";
import { LicenseSettings } from "@/routes/settings/license";
import { NotificationsSettings } from "@/routes/settings/notifications";
import { PhishingProtectionSettings } from "@/routes/settings/phishing-protection";
import { SavedSearchesSettings } from "@/routes/settings/saved-searches";
import { UnifiedInboxSettings } from "@/routes/settings/unified-inbox";
import { UpdatesSettings } from "@/routes/settings/updates";
import { VerificationCodesSettings } from "@/routes/settings/verification-codes";
import { VersionHistorySettings } from "@/routes/settings/version-history";
import { WorkspaceAppsSettings } from "@/routes/settings/workspace-apps";

export const sidebarNavItems: SidebarNavItemProps[] = [
  {
    label: "Download History",
    path: "/main/download-history",
    component: DownloadHistory,
  },
  {
    type: "separator",
  },
  {
    label: "General",
    path: "/main/settings/general",
    component: GeneralSettings,
  },
  {
    label: "Accounts",
    path: "/main/settings/accounts",
    component: AccountsSettings,
  },
  {
    label: "Appearance",
    path: "/main/settings/appearance",
    component: AppearanceSettings,
  },
  { label: "Blocker", path: "/main/settings/blocker", component: BlockerSettings },
  {
    label: "Downloads",
    path: "/main/settings/downloads",
    component: DownloadsSettings,
  },
  {
    label: "Gmail",
    path: "/main/settings/gmail",
    component: GmailSettings,
  },
  {
    label: "Workspace Apps",
    path: "/main/settings/workspace-apps",
    component: WorkspaceAppsSettings,
  },
  {
    label: "Languages",
    path: "/main/settings/languages",
    component: LanguagesSettings,
    hidden: platform.isMacOS,
  },
  {
    label: "Notifications",
    path: "/main/settings/notifications",
    component: NotificationsSettings,
  },
  {
    label: "Phishing Protection",
    path: "/main/settings/phishing-protection",
    component: PhishingProtectionSettings,
  },
  {
    label: "Saved Searches",
    path: "/main/settings/saved-searches",
    component: SavedSearchesSettings,
  },
  {
    label: "Unified Inbox",
    path: "/main/settings/unified-inbox",
    component: UnifiedInboxSettings,
  },
  {
    label: "Updates",
    path: "/main/settings/updates",
    component: UpdatesSettings,
  },
  {
    label: "Verification Codes",
    path: "/main/settings/verification-codes",
    component: VerificationCodesSettings,
  },
  {
    label: "Advanced",
    path: "/main/settings/advanced",
    component: AdvancedSettings,
  },
  { type: "separator" },
  { label: "License", path: "/main/settings/license", component: LicenseSettings },
  {
    label: "What's New",
    path: "/main/settings/version-history",
    component: VersionHistorySettings,
  },
  {
    label: "About Meru",
    path: "/main/settings/about",
    component: AboutSettings,
  },
];

type SidebarNavItemProps =
  | {
      type?: "item";
      label: string;
      path: string;
      disabled?: boolean;
      hidden?: boolean;
      component: RouteProps["component"];
    }
  | {
      type: "separator";
      label?: undefined;
      path?: undefined;
      disabled?: undefined;
      hidden?: undefined;
      component?: undefined;
    };

export function AppSidebar() {
  const [location, navigate] = useLocation();

  const isSettingsOpen = useSettingsStore((state) => state.isOpen);

  if (!isSettingsOpen) {
    return;
  }

  return (
    <div className="bg-sidebar p-4 pr-0">
      <ScrollArea className="h-full w-56">
        <div className="space-y-2">
          {sidebarNavItems
            .filter((item) => !item.hidden)
            .map(({ type, label, path }, index) => {
              if (type === "separator") {
                // biome-ignore lint/suspicious/noArrayIndexKey: Key is acceptable here
                return <Separator key={index} />;
              }

              return (
                <Button
                  // biome-ignore lint/suspicious/noArrayIndexKey: Key is acceptable here
                  key={index}
                  onClick={() => {
                    navigate(path);
                  }}
                  className={cn("w-full justify-start font-normal", {
                    "text-muted-foreground hover:text-muted-foreground": location !== path,
                  })}
                  variant={location === path ? "secondary" : "ghost"}
                >
                  {label}
                </Button>
              );
            })}
        </div>
      </ScrollArea>
    </div>
  );
}
