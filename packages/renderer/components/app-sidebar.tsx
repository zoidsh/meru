import { useTranslation } from "@meru/i18n/provider";
import { Button } from "@meru/ui/components/button";
import { ScrollArea } from "@meru/ui/components/scroll-area";
import { Separator } from "@meru/ui/components/separator";
import { cn } from "@meru/ui/lib/utils";
import { platform } from "@meru/renderer-lib/utils";
import { type RouteProps, useLocation } from "wouter";
import { AccountsSettings } from "@/routes/settings/accounts";
import { AdvancedSettings } from "@/routes/settings/advanced";
import { AppearanceSettings } from "@/routes/settings/appearance";
import { BlockerSettings } from "@/routes/settings/blocker";
import { DownloadHistory } from "@/routes/download-history";
import { DownloadsSettings } from "@/routes/settings/downloads";
import { GmailSettings } from "@/routes/settings/gmail";
import { GoogleAppsSettings } from "@/routes/settings/google-apps";
import { LanguagesSettings } from "@/routes/settings/languages";
import { LicenseSettings } from "@/routes/settings/license";
import { NotificationsSettings } from "@/routes/settings/notifications";
import { PhishingProtectionSettings } from "@/routes/settings/phishing-protection";
import { SavedSearchesSettings } from "@/routes/settings/saved-searches";
import { UnifiedInboxSettings } from "@/routes/settings/unified-inbox";
import { UpdatesSettings } from "@/routes/settings/updates";
import { VerificationCodesSettings } from "@/routes/settings/verification-codes";
import { VersionHistorySettings } from "@/routes/settings/version-history";
import { useSettingsStore } from "@/lib/stores";

export const sidebarNavItems: SidebarNavItemProps[] = [
  {
    labelKey: "downloadHistory",
    path: "/download-history",
    component: DownloadHistory,
  },
  {
    type: "separator",
  },
  {
    labelKey: "accounts",
    path: "/settings/accounts",
    component: AccountsSettings,
  },
  {
    labelKey: "appearance",
    path: "/settings/appearance",
    component: AppearanceSettings,
  },
  { labelKey: "blocker", path: "/settings/blocker", component: BlockerSettings },
  {
    labelKey: "downloads",
    path: "/settings/downloads",
    component: DownloadsSettings,
  },
  {
    labelKey: "gmail",
    path: "/settings/gmail",
    component: GmailSettings,
  },
  {
    labelKey: "googleApps",
    path: "/settings/google-apps",
    component: GoogleAppsSettings,
  },
  {
    labelKey: "languages",
    path: "/settings/languages",
    component: LanguagesSettings,
    hidden: platform.isMacOS,
  },
  {
    labelKey: "notifications",
    path: "/settings/notifications",
    component: NotificationsSettings,
  },
  {
    labelKey: "phishingProtection",
    path: "/settings/phishing-protection",
    component: PhishingProtectionSettings,
  },
  {
    labelKey: "savedSearches",
    path: "/settings/saved-searches",
    component: SavedSearchesSettings,
  },
  {
    labelKey: "unifiedInbox",
    path: "/settings/unified-inbox",
    component: UnifiedInboxSettings,
  },
  {
    labelKey: "updates",
    path: "/settings/updates",
    component: UpdatesSettings,
  },
  {
    labelKey: "verificationCodes",
    path: "/settings/verification-codes",
    component: VerificationCodesSettings,
  },
  {
    labelKey: "advanced",
    path: "/settings/advanced",
    component: AdvancedSettings,
  },
  { type: "separator" },
  { labelKey: "license", path: "/settings/license", component: LicenseSettings },
  {
    labelKey: "whatsNew",
    path: "/settings/version-history",
    component: VersionHistorySettings,
  },
];

type SidebarNavItemProps =
  | {
      type?: "item";
      labelKey: string;
      path: string;
      disabled?: boolean;
      hidden?: boolean;
      component: RouteProps["component"];
    }
  | {
      type: "separator";
      labelKey?: undefined;
      path?: undefined;
      disabled?: undefined;
      hidden?: undefined;
      component?: undefined;
    };

export function AppSidebar() {
  const { t } = useTranslation();

  const [location, navigate] = useLocation();

  const isSettingsOpen = useSettingsStore((state) => state.isOpen);

  if (!isSettingsOpen) {
    return;
  }

  return (
    <div className="bg-sidebar p-4 pr-0">
      <ScrollArea className="w-56 h-full">
        <div className="space-y-2">
          {sidebarNavItems
            .filter((item) => !item.hidden)
            .map(({ type, labelKey, path }, index) => {
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
                  {t(`sidebar.${labelKey}`)}
                </Button>
              );
            })}
        </div>
      </ScrollArea>
    </div>
  );
}
