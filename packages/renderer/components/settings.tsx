import { cn } from "@meru/ui/lib/utils";
import type { ComponentProps } from "react";

export function SettingsHeader({ className, ...props }: ComponentProps<"div">) {
	return (
		<div className={cn("mb-8 flex justify-between", className)} {...props} />
	);
}

export function SettingsTitle({ className, ...props }: ComponentProps<"div">) {
	return <div className={cn("text-2xl font-semibold", className)} {...props} />;
}
