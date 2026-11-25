import { cn } from "cn";
import { useId } from "react";
import type { ReactNode } from "react";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "#ui/field.tsx";

import { OverrideBar } from "./row-scope.tsx";
import type { RowScope } from "./row-scope.tsx";

/** A row's scope while its page has none. */
const NO_SCOPE: RowScope = {};

/**
 * A row of the page: its label and descriptions, and its control. While Do
 * Not Disturb outranks it, it dims, says so and still works. In a profile's
 * scope or under All profiles it carries what `scope` adds.
 */

export const SettingRow = ({
  label,
  description,
  notice,
  paused,
  scope = NO_SCOPE,
  disabled = false,
  children,
}: {
  label: string;
  /** A path or another value that may be long, broken anywhere to fit. */
  description?: ReactNode;
  /** A line under the description about the row's state, which never dims. */
  notice?: string | undefined;
  /** The line saying Do Not Disturb outranks it, while it does. */
  paused?: string | undefined;
  scope?: RowScope;
  disabled?: boolean;
  children: (ids: { label: string; description: string }) => ReactNode;
}) => {
  const labelId = useId();
  const descriptionId = useId();
  const noticeId = useId();
  const pausedId = useId();
  const describedBy = [
    description && descriptionId,
    notice && noticeId,
    paused && pausedId,
  ]
    .filter(Boolean)
    .join(" ");
  const dims = paused !== undefined;

  return (
    <Field
      orientation="horizontal"
      className="relative"
      data-disabled={disabled || undefined}
    >
      {scope.bar && <OverrideBar color={scope.bar} />}
      <FieldContent>
        <FieldLabel id={labelId} className={cn(dims && "opacity-50")}>
          {label}
        </FieldLabel>
        {description && (
          <FieldDescription
            id={descriptionId}
            className={cn(dims && "opacity-50")}
          >
            {description}
          </FieldDescription>
        )}
        {notice && <FieldDescription id={noticeId}>{notice}</FieldDescription>}
        {paused && <FieldDescription id={pausedId}>{paused}</FieldDescription>}
        {scope.line}
      </FieldContent>
      <div className="flex flex-col items-end gap-1.5">
        <div className={cn("flex items-center gap-2", dims && "opacity-50")}>
          {children({ label: labelId, description: describedBy })}
        </div>
        {scope.reset}
      </div>
    </Field>
  );
};

/** Rows with a separator between each. */
export const Rows = ({ children }: { children: ReactNode[] }) => (
  <FieldGroup>
    {children.flatMap((row, index) =>
      index === 0 ? [row] : [<FieldSeparator key={`separator-${index}`} />, row]
    )}
  </FieldGroup>
);
