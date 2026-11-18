import { useLingui } from "@lingui/react/macro";
import { PowerIcon } from "lucide-react";

import type { ShellState } from "#contract/shell.ts";
import type { ProfileMenuItemId } from "#core/profile-menu.ts";

import { OverlayMenu } from "./overlay-menu.tsx";
import { shellCalls } from "./sync.ts";

type ProfileMenuOverlay = Extract<
  ShellState["overlay"],
  { kind: "profile-menu" }
>;

const run = (item: ProfileMenuItemId) => {
  shellCalls().runProfileMenuItem({ item });
};

/** A profile button's context menu: Sleep, or Wake while it sleeps. */
export const ProfileMenu = ({
  menu,
  target,
}: {
  menu: ProfileMenuOverlay;
  target: Document;
}) => {
  const { t } = useLingui();

  const text = (id: ProfileMenuItemId) =>
    id === "sleep"
      ? t({
          message: "Sleep",
          comment:
            "Item of a profile button's context menu that closes every page of the profile until it is woken, its mail still checked",
        })
      : t({
          message: "Wake",
          comment:
            "Item of a sleeping profile's context menu, in place of Sleep, that selects the profile and loads its pages again",
        });

  return (
    <OverlayMenu
      title={menu.title}
      x={menu.x}
      y={menu.y}
      groups={[
        menu.items.map((item) => ({
          ...item,
          icon: <PowerIcon />,
          text: text(item.id),
        })),
      ]}
      target={target}
      run={run}
    />
  );
};
