import { Trans } from "@lingui/react/macro";
import { WEBSITE_URL } from "@meru/shared/constants";
import { buttonVariants } from "@meru/ui/components/button";
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
        <ItemTitle>
          {children || <Trans>Upgrade to Meru Pro to unlock all options</Trans>}
        </ItemTitle>
      </ItemContent>
      <ItemActions>
        <a
          href={`${WEBSITE_URL}#pricing`}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ size: "sm" })}
        >
          <Trans comment="Button on the banner at the top of a Settings page, which opens Meru Pro's pricing page">
            Upgrade
          </Trans>
        </a>
      </ItemActions>
    </Item>
  );
}
