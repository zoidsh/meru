/**
 * Whether the Dock shows Meru's icon: as set, and always while the menu bar
 * icon is off, so a file with both off still leaves Meru within reach.
 */
export const dockShown = ({
  dockIcon,
  tray,
}: {
  dockIcon: boolean;
  tray: boolean;
}) => dockIcon || !tray;

/** Whether the Dock icon may be turned off: only while the menu bar icon shows. */
export const canHideDock = ({ tray }: { tray: boolean }) => tray;
