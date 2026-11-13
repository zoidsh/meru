import type { ReactNode } from "react";

import type { Message } from "../../../shared/msg.ts";
import { Card } from "../../ui/card.tsx";

/** A section of a settings page: its heading above a card whose rows are divided by a line; with no heading, the page's own settings under its title. */
export const SettingsSection = ({
  heading,
  children,
}: {
  readonly heading?: Message;
  readonly children: ReactNode;
}) => (
  <section aria-label={heading} className="flex flex-col gap-2">
    {heading === undefined ? undefined : (
      <h2 className="px-1 text-sm font-medium">{heading}</h2>
    )}
    <Card className="gap-0 divide-y py-0" data-section={heading ?? ""}>
      {children}
    </Card>
  </section>
);
