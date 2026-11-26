import { useId } from "react";
import type { ReactNode } from "react";

import { Card, CardContent } from "#ui/card.tsx";
import { FieldDescription, FieldLegend, FieldSet } from "#ui/field.tsx";

/**
 * A page's groups, one column, each 24px from the next whether it has a
 * heading or not.
 */
export const SettingGroups = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-col gap-6">{children}</div>
);

/**
 * A card of rows with its heading above it at the card's edge, as System
 * Settings draws a group: the fieldset groups the rows for assistive
 * technology and its legend names them, its description describing them.
 * With no title it is the card alone.
 */
export const SettingGroup = ({
  title,
  description,
  children,
}: {
  title?: string | undefined;
  description?: string | undefined;
  children: ReactNode;
}) => {
  const descriptionId = useId();
  const card = (
    <Card>
      <CardContent>{children}</CardContent>
    </Card>
  );

  if (title === undefined) {
    return card;
  }

  return (
    // The legend is no flex item, so its own 6px margin is what parts it from
    // the card; the gap is the same 6px under a description.
    <FieldSet
      aria-describedby={description ? descriptionId : undefined}
      className="gap-1.5"
    >
      <FieldLegend variant="label">{title}</FieldLegend>
      {description && (
        <FieldDescription id={descriptionId}>{description}</FieldDescription>
      )}
      {card}
    </FieldSet>
  );
};
