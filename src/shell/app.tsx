export const App = () => (
  <div className="flex h-full flex-col">
    {/* The preload stamps data-platform; the traffic lights take the left end on macOS. */}
    <header
      aria-label="Title bar"
      className="flex h-10 shrink-0 items-center justify-center border-b border-border bg-titlebar px-3 [app-region:drag] in-data-[platform=darwin]:pl-20"
    >
      <span className="text-xs font-medium text-muted-foreground">Meru</span>
    </header>
    <main aria-label="Content" className="min-h-0 flex-1" />
  </div>
);
