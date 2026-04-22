import { APP_TITLEBAR_HEIGHT } from "@meru/shared/constants";

export function App() {
  return (
    <div
      className="bg-background border-b draggable select-none"
      style={{ height: APP_TITLEBAR_HEIGHT }}
    />
  );
}
