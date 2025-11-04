import { licenseKeySearchParam } from "@meru/renderer-lib/search-params";
import { Button } from "@meru/ui/components/button";
import { ScrollArea } from "@meru/ui/components/scroll-area";
import { Separator } from "@meru/ui/components/separator";
import { cn } from "@meru/ui/lib/utils";
import { useLocation } from "wouter";

const navItems: NavItemProps[] = [
	{ label: "Accounts", href: "/accounts" },
	{
		label: "Saved Searches",
		href: "/saved-searches",
		disabled: !licenseKeySearchParam,
	},
	{ label: "Download History", href: "/download-history" },
	{
		label: "Verification Codes",
		href: "/verification-codes",
		disabled: !licenseKeySearchParam,
	},
	{
		label: "Notifications",
		href: "/settings/notifications",
	},
	{ type: "separator" },
	{ label: "License", href: "/license" },
	{ label: "What's New", href: "/version-history" },
];

type NavItemProps =
	| {
			type?: "item";
			label: string;
			href: string;
			disabled?: boolean;
	  }
	| {
			type: "separator";
			label?: undefined;
			href?: undefined;
			disabled?: undefined;
	  };

export function AppSidebar() {
	const [location, navigate] = useLocation();

	return (
		<ScrollArea className="w-56 bg-sidebar p-4">
			<div className="space-y-2">
				{navItems.map(({ type, label, href, disabled }, index) => {
					if (type === "separator") {
						// biome-ignore lint/suspicious/noArrayIndexKey: Key is acceptable here
						return <Separator key={index} />;
					}

					return (
						<Button
							// biome-ignore lint/suspicious/noArrayIndexKey: Key is acceptable here
							key={index}
							onClick={() => {
								navigate(href);
							}}
							className={cn("w-full justify-start font-normal", {
								"text-muted-foreground hover:text-muted-foreground":
									location !== href,
							})}
							variant={location === href ? "secondary" : "ghost"}
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
