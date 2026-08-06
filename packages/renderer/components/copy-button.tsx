import { useCopied } from "@meru/shared/renderer/hooks";
import { Button } from "@meru/ui/components/button";
import { CheckIcon, CopyIcon } from "lucide-react";
import type { ComponentProps } from "react";

export function CopyButton({
  value,
  variant = "outline",
  size = "icon",
  ...props
}: { value: string } & ComponentProps<typeof Button>) {
  const { copied, markCopied } = useCopied();

  return (
    <Button
      variant={variant}
      size={size}
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
