import type { MessageDescriptor } from "@lingui/core";
import { useLingui } from "@lingui/react/macro";
import { Button } from "@meru/ui/components/button";
import { ScrollArea } from "@meru/ui/components/scroll-area";
import { Separator } from "@meru/ui/components/separator";
import { cn } from "@meru/ui/lib/utils";
import { type RouteProps, useLocation } from "wouter";
import { settingsPageLabels } from "@/lib/settings-pages";
import { platform } from "@/lib/utils";
import { AboutSettings } from "@/routes/settings/about";
import { AccountsSettings } from "@/routes/settings/accounts";
import { AdvancedSettings } from "@/routes/settings/advanced";
import { AppearanceSettings } from "@/routes/settings/appearance";
import { BlockerSettings } from "@/routes/settings/blocker";
import { DownloadsSettings } from "@/routes/settings/downloads";
import { ExtensionsSettings } from "@/routes/settings/extensions";
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
    label: settingsPageLabels.general,
    path: "/settings/general",
    component: GeneralSettings,
  },
  {
    label: settingsPageLabels.accounts,
    path: "/settings/accounts",
    component: AccountsSettings,
  },
  {
    label: settingsPageLabels.appearance,
    path: "/settings/appearance",
    component: AppearanceSettings,
  },
  { label: settingsPageLabels.blocker, path: "/settings/blocker", component: BlockerSettings },
  {
    label: settingsPageLabels.downloads,
    path: "/settings/downloads",
    component: DownloadsSettings,
  },
  {
    // oxlint-disable-next-line lingui/no-unlocalized-strings -- a product name, which stays as it is
    label: "Gmail",
    path: "/settings/gmail",
    component: GmailSettings,
  },
  {
    label: settingsPageLabels.workspaceApps,
    path: "/settings/workspace-apps",
    component: WorkspaceAppsSettings,
  },
  {
    label: settingsPageLabels.extensions,
    path: "/settings/extensions",
    component: ExtensionsSettings,
  },
  {
    label: settingsPageLabels.languages,
    path: "/settings/languages",
    component: LanguagesSettings,
    hidden: platform.isMacOS,
  },
  {
    label: settingsPageLabels.notifications,
    path: "/settings/notifications",
    component: NotificationsSettings,
  },
  {
    label: settingsPageLabels.phishingProtection,
    path: "/settings/phishing-protection",
    component: PhishingProtectionSettings,
  },
  {
    label: settingsPageLabels.savedSearches,
    path: "/settings/saved-searches",
    component: SavedSearchesSettings,
  },
  {
    label: settingsPageLabels.unifiedInbox,
    path: "/settings/unified-inbox",
    component: UnifiedInboxSettings,
  },
  {
    label: settingsPageLabels.updates,
    path: "/settings/updates",
    component: UpdatesSettings,
  },
  {
    label: settingsPageLabels.verificationCodes,
    path: "/settings/verification-codes",
    component: VerificationCodesSettings,
  },
  {
    label: settingsPageLabels.advanced,
    path: "/settings/advanced",
    component: AdvancedSettings,
  },
  { type: "separator" },
  { label: settingsPageLabels.license, path: "/settings/license", component: LicenseSettings },
  {
    label: settingsPageLabels.versionHistory,
    path: "/settings/version-history",
    component: VersionHistorySettings,
  },
  {
    label: settingsPageLabels.about,
    path: "/settings/about",
    component: AboutSettings,
  },
];

type SidebarNavItemProps =
  | {
      type?: "item";
      /** A string only for a product name, which is never translated. */
      label: MessageDescriptor | string;
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

  const { t } = useLingui();

  return (
    /*
     * The gutter the items need for their focus rings is set inside the
     * scroller rather than around it, because the scroller clips at its own
     * edge and the items are as wide as it is. The padding that used to sit out
     * here pays for it, so the items land where they always did.
     */
    <div className="bg-sidebar py-3 pl-3" data-testid="settings-nav">
      <ScrollArea className="h-full w-58">
        <div className="space-y-2 p-1">
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
                  // A label too long for the strip wraps rather than clipping;
                  // min-h-8 and py-1 keep a one-line item at the Button's h-8.
                  className={cn(
                    "h-auto min-h-8 w-full justify-start py-1 text-left font-normal wrap-anywhere whitespace-normal",
                    {
                      "text-muted-foreground hover:text-muted-foreground": location !== path,
                    },
                  )}
                  variant={location === path ? "secondary" : "ghost"}
                >
                  {typeof label === "string" ? label : t(label)}
                </Button>
              );
            })}
        </div>
      </ScrollArea>
    </div>
  );
}
