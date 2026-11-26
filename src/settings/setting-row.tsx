import { cn } from "cn";
import { useId } from "react";
import type { ReactNode } from "react";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "#ui/field.tsx";

import { ProBadge } from "./pro-badge.tsx";
import { OverrideBar } from "./row-scope.tsx";
import type { RowScope } from "./row-scope.tsx";

/** A row's scope while its page has none. */
const NO_SCOPE: RowScope = {};

/** A row's label, with the Meru Pro badge beside it on a Pro row. */
export const RowLabel = ({
  id,
  label,
  pro,
  className,
}: {
  id: string;
  label: string;
  pro?: boolean | undefined;
  className?: string | undefined;
}) => {
  const fieldLabel = (
    <FieldLabel id={id} className={className}>
      {label}
    </FieldLabel>
  );

  return pro ? (
    <div className="flex items-center gap-2">
      {fieldLabel}
      <ProBadge labelledBy={id} />
    </div>
  ) : (
    fieldLabel
  );
};

const LiveText = ({
  live,
  children,
}: {
  live: boolean | undefined;
  children: ReactNode;
}) => (live ? <output className="flex flex-1">{children}</output> : children);

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
  error,
  scope = NO_SCOPE,
  disabled = false,
  pro,
  live,
  children,
}: {
  /**
   * A Pro row on the free version, which shows the Meru Pro badge beside
   * the label; its caller disables the row and its control.
   */
  pro?: boolean | undefined;
  label: string;
  /** A path or another value that may be long, broken anywhere to fit. */
  description?: ReactNode;
  /** A line under the description about the row's state, which never dims. */
  notice?: string | undefined;
  /** The line saying Do Not Disturb outranks it, while it does. */
  paused?: string | undefined;
  /** Why what the row last sent failed, which marks its control invalid. */
  error?: string | undefined;
  scope?: RowScope;
  disabled?: boolean;
  /**
   * Makes the label and descriptions a live region, so a change to them is
   * read out once; the control stays outside it.
   */
  live?: boolean | undefined;
  children: (ids: { label: string; description: string }) => ReactNode;
}) => {
  const labelId = useId();
  const descriptionId = useId();
  const noticeId = useId();
  const pausedId = useId();
  const errorId = useId();
  const describedBy = [
    description && descriptionId,
    notice && noticeId,
    paused && pausedId,
    error && errorId,
  ]
    .filter(Boolean)
    .join(" ");
  const dims = paused !== undefined;
  // Nothing under the label, so it is centered on the controls; a row with
  // a line under it keeps its label at the top.
  const centered = describedBy === "" && scope.line === undefined;
  const text = centered ? (
    <RowLabel id={labelId} label={label} pro={pro} />
  ) : (
    <FieldContent>
      <RowLabel
        id={labelId}
        label={label}
        pro={pro}
        className={cn(dims && "opacity-50")}
      />
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
      {error && <FieldError id={errorId}>{error}</FieldError>}
      {scope.line}
    </FieldContent>
  );

  return (
    <Field
      orientation="horizontal"
      // Field aligns the row to its top by a child of its own holding
      // content, which a live region wraps.
      className="relative has-[>output>[data-slot=field-content]]:items-start"
      data-disabled={disabled || undefined}
      data-invalid={error ? true : undefined}
    >
      {scope.bar && <OverrideBar color={scope.bar} />}
      {/* A label alone is the field's own child, which Field centers on the
          controls; content under it aligns the row to its top. */}
      <LiveText live={live}>{text}</LiveText>
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
