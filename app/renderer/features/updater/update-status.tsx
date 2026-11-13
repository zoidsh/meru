import { useState } from "react";

import type { UpdateState } from "../../../core/records/update.ts";
import { commands } from "../../../shared/channels/commands.ts";
import { msg } from "../../../shared/msg.ts";
import type { Message } from "../../../shared/msg.ts";
import { Button } from "../../ui/button.tsx";
import type { PageContent } from "../settings/page-content.ts";
import { SettingsSection } from "../settings/settings-section.tsx";
import { useSettingsClient } from "../settings/use-settings-client.ts";
import { useUpdate } from "./use-update.ts";

const describe = (state: UpdateState): Message => {
  if (state.kind === "checking") {
    return msg`Checking for updates…`;
  }
  if (state.kind === "available") {
    return msg`Meru ${state.version} is available.`;
  }
  if (state.kind === "downloading") {
    return msg`Downloading the update, ${Math.round(state.percent)}%…`;
  }
  if (state.kind === "ready") {
    return msg`Meru ${state.version} is ready. Restart Meru to update.`;
  }
  if (state.kind === "error") {
    return msg`Meru couldn't check for updates.`;
  }
  return msg`Meru checks for updates in the background.`;
};

/** Where the updater is, and a check or the restart that installs a downloaded update. */
export const UpdateStatus = () => {
  const client = useSettingsClient();
  const state = useUpdate();
  const [refusal, setRefusal] = useState<Message | undefined>(undefined);
  const ready = state.kind === "ready";
  const run = async () => {
    const ran = await client.invoke(commands.run, {
      id: ready ? "updater.install" : "updater.check",
    });
    if (ran.ok) {
      setRefusal(undefined);
    } else {
      setRefusal(
        ran.error.message.includes("notPackaged")
          ? msg`Updates come only to an installed Meru.`
          : msg`Meru couldn't check for updates.`
      );
    }
  };
  return (
    <SettingsSection>
      <div className="flex items-center justify-between gap-6 p-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm" data-update={state.kind}>
            {describe(state)}
          </p>
          {refusal === undefined ? undefined : (
            <p className="text-muted-foreground text-xs">{refusal}</p>
          )}
        </div>
        <Button
          disabled={state.kind === "checking" || state.kind === "downloading"}
          onClick={() => {
            void run();
          }}
          variant="outline"
        >
          {ready ? msg`Restart to update` : msg`Check for updates`}
        </Button>
      </div>
    </SettingsSection>
  );
};

export const updatesContent: PageContent = {
  Content: UpdateStatus,
  page: "updates",
};
