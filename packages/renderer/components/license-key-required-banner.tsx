import { useTranslation } from "@meru/i18n/provider";
import { WEBSITE_URL } from "@meru/shared/constants";
import { buttonVariants } from "@meru/ui/components/button";
import { Item, ItemActions, ItemContent, ItemTitle } from "@meru/ui/components/item";
import type { ComponentProps } from "react";
import { useIsLicenseKeyValid } from "@/lib/hooks";

export function LicenseKeyRequiredBanner({ children, ...props }: ComponentProps<typeof Item>) {
  const { t } = useTranslation();

  const isLicenseKeyValid = useIsLicenseKeyValid();

  if (isLicenseKeyValid) {
    return;
  }

  return (
    <Item variant="muted" className="mb-8" {...props}>
      <ItemContent>
        <ItemTitle>{children || t("components.licenseBanner.upgradeAll")}</ItemTitle>
      </ItemContent>
      <ItemActions>
        <a
          href={`${WEBSITE_URL}#pricing`}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ size: "sm" })}
        >
          {t("components.licenseBanner.purchase")}
        </a>
      </ItemActions>
    </Item>
  );
}
