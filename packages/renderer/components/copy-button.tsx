import { useLingui } from "@lingui/react/macro";
import { Button } from "@meru/ui/components/button";
import { CheckIcon, CopyIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { useCopied } from "@/lib/hooks";

export function CopyButton({
  value,
  variant = "outline",
  size = "icon",
  ...props
}: { value: string } & ComponentProps<typeof Button>) {
  const { t } = useLingui();
  const { copied, markCopied } = useCopied();

  return (
    <Button
      variant={variant}
      size={size}
      aria-label={t({
        message: "Copy",
        comment: "Screen reader label of an icon button that copies the value beside it",
      })}
      {...props}
      onClick={() => {
        navigator.clipboard.writeText(value);

        markCopied();
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  );
}
