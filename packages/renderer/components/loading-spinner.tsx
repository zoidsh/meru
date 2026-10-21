import { useLingui } from "@lingui/react/macro";
import { Spinner } from "@meru/ui/components/spinner";
import type { ComponentProps } from "react";

/**
 * `packages/ui` stays vendored, so its spinner takes its screen reader label as
 * a prop, and this gives it the translated one.
 */
export function LoadingSpinner(props: Omit<ComponentProps<typeof Spinner>, "aria-label">) {
  const { t } = useLingui();

  return (
    <Spinner
      aria-label={t({
        message: "Loading",
        comment: "Screen reader label of a spinner shown while something loads",
      })}
      {...props}
    />
  );
}
