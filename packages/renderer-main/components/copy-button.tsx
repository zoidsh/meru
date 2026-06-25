import { ms } from "@meru/shared/ms";
import { Button } from "@meru/ui/components/button";
import { CheckIcon, CopyIcon } from "lucide-react";
import { type ComponentProps, useEffect, useRef, useState } from "react";

export function CopyButton({
  value,
  variant = "outline",
  size = "icon",
  ...props
}: { value: string } & ComponentProps<typeof Button>) {
  const [copied, setCopied] = useState(false);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <Button
      variant={variant}
      size={size}
      {...props}
      onClick={() => {
        navigator.clipboard.writeText(value);

        setCopied(true);

        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
          setCopied(false);
        }, ms("2s"));
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  );
}
