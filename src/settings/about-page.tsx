import { useLingui } from "@lingui/react/macro";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useId } from "react";

import type { AboutItem } from "#contract/settings.ts";
import { Button } from "#ui/button.tsx";

import { useDoneBriefly } from "./done-briefly.ts";
import { SettingGroup, SettingGroups } from "./setting-group.tsx";
import { Rows, SettingRow } from "./setting-row.tsx";
import { settingsCalls, useSettingsState } from "./sync.ts";

/**
 * A value and its Copy, which has main put its own string on the clipboard;
 * the value describes the button, so a screen reader says what it copies.
 */
const CopyableValue = ({
  item,
  value,
  name,
}: {
  item: AboutItem;
  value: string;
  name: string;
}) => {
  const { t } = useLingui();
  const [copied, showCopied] = useDoneBriefly();
  const valueId = useId();

  return (
    <>
      <span id={valueId} className="text-sm text-muted-foreground">
        {value}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={name}
        aria-describedby={valueId}
        title={t({
          message: "Copy",
          comment:
            "Tooltip of the buttons on the About page of Settings that copy Meru's version or the operating system",
        })}
        onClick={async () => {
          const done = await settingsCalls()
            .copyAboutValue({ item })
            .then(() => true)
            .catch(() => false);

          if (done) {
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
              "Read out by screen readers once Meru's version or the operating system is on the clipboard, from the About page of Settings",
          })}
      </output>
    </>
  );
};

/**
 * About: this build's version and the system it runs on, each with Copy,
 * for a support message. Neither value is translated.
 */
export const AboutPage = () => {
  const { t } = useLingui();
  const about = useSettingsState("about");

  if (!about) {
    return null;
  }

  const rows = [
    {
      item: "version" as const,
      label: t({
        message: "Version",
        comment:
          "Label of the row on the About page of Settings showing Meru's version number",
      }),
      copy: t({
        message: "Copy version",
        comment:
          "Accessible name of the button on the About page of Settings that copies Meru's version number",
      }),
    },
    {
      item: "operatingSystem" as const,
      label: t({
        message: "Operating system",
        comment:
          "Label of the row on the About page of Settings showing the computer's operating system, its version and processor architecture",
      }),
      copy: t({
        message: "Copy operating system",
        comment:
          "Accessible name of the button on the About page of Settings that copies the operating system's name, version and architecture",
      }),
    },
  ];

  return (
    <SettingGroups>
      <SettingGroup>
        <Rows>
          {rows.map(({ item, label, copy }) => (
            <SettingRow key={item} center label={label}>
              {() => (
                <CopyableValue item={item} value={about[item]} name={copy} />
              )}
            </SettingRow>
          ))}
        </Rows>
      </SettingGroup>
    </SettingGroups>
  );
};
