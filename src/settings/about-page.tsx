import { useLingui } from "@lingui/react/macro";
import { useId } from "react";

import type { AboutItem } from "#contract/settings.ts";

import { CopyButton } from "./copy-button.tsx";
import { SettingGroup, SettingGroups } from "./setting-group.tsx";
import { Rows, SettingRow } from "./setting-row.tsx";
import { settingsCalls, useSettingsState } from "./sync.ts";

/**
 * A value and its Copy; the value describes the button, so a screen reader
 * says what it copies.
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
  const valueId = useId();

  return (
    <>
      <span id={valueId} className="text-sm text-muted-foreground">
        {value}
      </span>
      <CopyButton
        name={name}
        describedBy={valueId}
        copy={() =>
          settingsCalls()
            .copyAboutValue({ item })
            .then(() => true)
        }
      />
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
