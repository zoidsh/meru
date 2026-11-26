import { useLingui } from "@lingui/react/macro";
import { CheckIcon, CopyIcon } from "lucide-react";

import { Button } from "#ui/button.tsx";

import { useDoneBriefly } from "./done-briefly.ts";

/**
 * A Copy whose `copy` has main put its own string on the clipboard, so the
 * window never sends text there; it shows a check, and has "Copied" read out,
 * once `copy` says it is done.
 */
export const CopyButton = ({
  name,
  describedBy,
  copy,
}: {
  name: string;
  describedBy?: string;
  copy: () => Promise<boolean>;
}) => {
  const { t } = useLingui();
  const [copied, showCopied] = useDoneBriefly();

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={name}
        aria-describedby={describedBy}
        title={t({
          message: "Copy",
          comment:
            "Tooltip of the buttons in Settings that copy a value shown beside them: the license key on the Meru Pro page, Meru's version or the operating system on the About page",
        })}
        onClick={async () => {
          if (await copy().catch(() => false)) {
            showCopied();
          }
        }}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
      <output className="sr-only">
        {copied &&
          t({
            message: "Copied",
            comment:
              "Read out by screen readers in Settings once the license key, Meru's version or the operating system is on the clipboard",
          })}
      </output>
    </>
  );
};
