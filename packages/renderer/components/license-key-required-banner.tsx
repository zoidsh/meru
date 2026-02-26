import { WEBSITE_URL } from "@meru/shared/constants";
import { Button } from "@meru/ui/components/button";
import { Item, ItemActions, ItemContent, ItemTitle } from "@meru/ui/components/item";
import type { ComponentProps } from "react";
import { useIsLicenseKeyValid } from "@/lib/hooks";

export function LicenseKeyRequiredBanner({ children, ...props }: ComponentProps<typeof Item>) {
  const isLicenseKeyValid = useIsLicenseKeyValid();

  if (isLicenseKeyValid) {
    return;
  }

  return (
    <Item variant="muted" className="mb-8" {...props}>
      <ItemContent>
        <ItemTitle>{children || "Upgrade to Meru Pro to unlock all options"}</ItemTitle>
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
