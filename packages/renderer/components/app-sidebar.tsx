import { Button } from "@meru/ui/components/button";
import { ScrollArea } from "@meru/ui/components/scroll-area";
import { Separator } from "@meru/ui/components/separator";
import { cn } from "@meru/ui/lib/utils";
import { type RouteProps, useLocation } from "wouter";
import { AccountsSettings } from "@/routes/settings/accounts";
import { AdvancedSettings } from "@/routes/settings/advanced";
import { AppearanceSettings } from "@/routes/settings/appearance";
import { BlockerSettings } from "@/routes/settings/blocker";
import { DownloadHistorySettings } from "@/routes/settings/download-history";
import { DownloadsSettings } from "@/routes/settings/downloads";
import { GoogleAppsSettings } from "@/routes/settings/google-apps";
import { LicenseSettings } from "@/routes/settings/license";
import { NotificationsSettings } from "@/routes/settings/notifications";
import { PhishingProtectionSettings } from "@/routes/settings/phishing-protection";
import { SavedSearchesSettings } from "@/routes/settings/saved-searches";
import { UpdatesSettings } from "@/routes/settings/updates";
import { VerificationCodesSettings } from "@/routes/settings/verification-codes";
import { VersionHistorySettings } from "@/routes/settings/version-history";

export const sidebarNavItems: SidebarNavItemProps[] = [
	{
		label: "Download History",
		path: "/settings/download-history",
		component: DownloadHistorySettings,
	},
	{
		type: "separator",
	},
	{
		label: "Accounts",
		path: "/settings/accounts",
		component: AccountsSettings,
	},
	{
		label: "Appearance",
		path: "/settings/appearance",
		component: AppearanceSettings,
	},
	{ label: "Blocker", path: "/settings/blocker", component: BlockerSettings },
	{
		label: "Downloads",
		path: "/settings/downloads",
		component: DownloadsSettings,
	},
	{
		label: "Google Apps",
		path: "/settings/google-apps",
		component: GoogleAppsSettings,
	},
	{
		label: "Notifications",
		path: "/settings/notifications",
		component: NotificationsSettings,
	},
	{
		label: "Phishing Protection",
		path: "/settings/phishing-protection",
		component: PhishingProtectionSettings,
	},
	{
		label: "Saved Searches",
		path: "/settings/saved-searches",
		component: SavedSearchesSettings,
	},
	{
		label: "Updates",
		path: "/settings/updates",
		component: UpdatesSettings,
	},
	{
		label: "Verification Codes",
		path: "/settings/verification-codes",
		component: VerificationCodesSettings,
	},
	{
		label: "Advanced",
		path: "/settings/advanced",
		component: AdvancedSettings,
	},
	{ type: "separator" },
	{ label: "License", path: "/settings/license", component: LicenseSettings },
	{
		label: "What's New",
		path: "/settings/version-history",
		component: VersionHistorySettings,
	},
];

type SidebarNavItemProps =
	| {
			type?: "item";
			label: string;
			path: string;
			disabled?: boolean;
			component: RouteProps["component"];
	  }
	| {
			type: "separator";
			label?: undefined;
			path?: undefined;
			disabled?: undefined;
			component?: undefined;
	  };

export function AppSidebar() {
	const [location, navigate] = useLocation();

	return (
		<div className="bg-sidebar p-4">
			<ScrollArea className="w-56 h-full">
				<div className="space-y-2">
					{sidebarNavItems.map(({ type, label, path }, index) => {
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
									"text-muted-foreground hover:text-muted-foreground":
										location !== path,
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
