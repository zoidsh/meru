import { Button } from "@meru/ui/components/button";
import { Separator } from "@meru/ui/components/separator";
import { cn } from "@meru/ui/lib/utils";
import { useHashLocation } from "wouter/use-hash-location";

const navItems: NavItemProps[] = [
	{ label: "Download History", href: "/download-history" },
];

const navSettingsItems: NavItemProps[] = [
	{ label: "Accounts", href: "/accounts" },
	{ label: "License", href: "/license" },
];

type NavItemProps = {
	label: string;
	href: string;
};

export function AppSidebar() {
	const [location, navigate] = useHashLocation();

	const renderNavItem = ({ label, href }: NavItemProps) => {
		return (
			<li key={label}>
				<Button
					onClick={() => {
						navigate(href);
					}}
					className={cn("w-full justify-start font-normal", {
						"text-muted-foreground hover:text-muted-foreground":
							location !== href,
					})}
					variant={location === href ? "secondary" : "ghost"}
				>
					{label}
				</Button>
			</li>
		);
	};

	return (
		<div className="w-56">
			<div className="sticky top-8">
				<ul className="space-y-2">{navItems.map(renderNavItem)}</ul>
				<Separator className="my-4" />
				<ul className="space-y-2">{navSettingsItems.map(renderNavItem)}</ul>
			</div>
		</div>
	);
}
