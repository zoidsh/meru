import { useLingui } from "@lingui/react/macro";

export const App = () => {
  const { t } = useLingui();

  return (
    <div className="flex h-full flex-col">
      {/* The preload stamps data-platform; the traffic lights take the left end on macOS. */}
      <header
        aria-label={t({
          message: "Title bar",
          comment:
            "Accessible name of the strip across the top of the window, read by screen readers",
        })}
        className="flex h-10 shrink-0 items-center justify-center border-b border-border bg-sidebar px-3 [app-region:drag] in-data-[platform=darwin]:pl-20"
      >
        <span className="text-xs font-medium text-muted-foreground">Meru</span>
      </header>
      <main
        aria-label={t({
          message: "Content",
          comment:
            "Accessible name of the window's main area, below the title bar, read by screen readers",
        })}
        className="min-h-0 flex-1"
      />
    </div>
  );
};
