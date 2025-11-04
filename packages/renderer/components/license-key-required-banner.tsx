import { WEBSITE_URL } from "@meru/shared/constants";
import { Button } from "@meru/ui/components/button";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemMedia,
	ItemTitle,
} from "@meru/ui/components/item";
import { CircleArrowUpIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { useIsLicenseKeyValid } from "@/lib/hooks";

export function LicenseKeyRequiredBanner({
	children,
	...props
}: ComponentProps<typeof Item>) {
	const isLicenseKeyValid = useIsLicenseKeyValid();

	if (isLicenseKeyValid) {
		return;
	}

	return (
		<Item variant="muted" className="mb-8" {...props}>
			<ItemMedia variant="icon">
				<CircleArrowUpIcon />
			</ItemMedia>
			<ItemContent>
				<ItemTitle>Meru Pro Required</ItemTitle>
				<ItemDescription>
					{children || "Upgrade to Meru Pro to use this feature."}
				</ItemDescription>
			</ItemContent>
			<ItemActions>
				<Button size="sm" asChild>
					<a href={`${WEBSITE_URL}#pricing`} target="_blank" rel="noreferrer">
						Purchase
					</a>
				</Button>
			</ItemActions>
		</Item>
	);
}
