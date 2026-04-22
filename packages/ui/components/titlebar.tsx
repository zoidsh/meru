import { APP_TITLEBAR_HEIGHT } from "@meru/shared/constants";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/utils";
import { Button } from "./button";

export function Titlebar({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative bg-background border-b draggable select-none"
      style={{ height: APP_TITLEBAR_HEIGHT }}
    >
      <div
        className="absolute top-0 bottom-0 px-1.5 flex items-center justify-between"
        style={{
          left: "env(titlebar-area-x, 0)",
          width: "env(titlebar-area-width, 100%)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function TitlebarLeft({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-1">{children}</div>;
}

export function TitlebarRight({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-1">{children}</div>;
}

export function TitlebarIconButton({ className, ...props }: ComponentProps<typeof Button>) {
  return (
    <Button variant="ghost" size="icon-sm" className={cn("draggable-none", className)} {...props} />
  );
}
