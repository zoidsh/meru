import { accountColorsMap } from "@meru/shared/accounts";
import type { AccountConfig } from "@meru/shared/schemas";
import { cn } from "../lib/utils";
import { Badge } from "./badge";

type AccountBadgeProps = {
  label: string;
  color: AccountConfig["color"];
};

export function AccountBadge({ label, color }: AccountBadgeProps) {
  return (
    <Badge variant="secondary">
      {color && <div className={cn("size-2 rounded-full", accountColorsMap[color].className)} />}
      {label}
    </Badge>
  );
}
