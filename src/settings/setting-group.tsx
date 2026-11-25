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
 * A card of rows with its heading above it, as System Settings draws a
 * group: the fieldset groups the rows for assistive technology and its legend
 * names them, its description describing them. With no title it is the
 * card alone.
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
    <FieldSet aria-describedby={description ? descriptionId : undefined}>
      {/* px-4 meets the card's inner edge. */}
      <FieldLegend variant="label" className="px-4">
        {title}
      </FieldLegend>
      {description && (
        <FieldDescription id={descriptionId} className="px-4">
          {description}
        </FieldDescription>
      )}
      {card}
    </FieldSet>
  );
};
