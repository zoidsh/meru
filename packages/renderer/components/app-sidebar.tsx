import { licenseKeySearchParam } from "@meru/renderer-lib/search-params";
import { Button } from "@meru/ui/components/button";
import { ScrollArea } from "@meru/ui/components/scroll-area";
import { Separator } from "@meru/ui/components/separator";
import { cn } from "@meru/ui/lib/utils";
import { type RouteProps, useLocation } from "wouter";
import { AccountsSettings } from "@/routes/settings/accounts";
import { DownloadHistorySettings } from "@/routes/settings/download-history";
import { LicenseSettings } from "@/routes/settings/license";
import { NotificationsSettings } from "@/routes/settings/notifications";
import { SavedSearchesSettings } from "@/routes/settings/saved-searches";
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
	{ label: "Accounts", path: "/accounts", component: AccountsSettings },
	{
		label: "Notifications",
		path: "/settings/notifications",
		component: NotificationsSettings,
	},
	{
		label: "Saved Searches",
		path: "/settings/saved-searches",
		disabled: !licenseKeySearchParam,
		component: SavedSearchesSettings,
	},
	{
		label: "Verification Codes",
		path: "/settings/verification-codes",
		disabled: !licenseKeySearchParam,
		component: VerificationCodesSettings,
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
		<ScrollArea className="w-56 bg-sidebar p-4">
			<div className="space-y-2">
				{sidebarNavItems.map(({ type, label, path, disabled }, index) => {
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
							disabled={disabled}
						>
							{label}
						</Button>
					);
				})}
			</div>
		</ScrollArea>
	);
}
