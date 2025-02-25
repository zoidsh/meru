import { createRoot } from "react-dom/client";
import { Default } from "/Users/timche/GitHub/meru/src/renderer/components/app-titlebar.stories.tsx";

const rootElement = document.getElementById("root");

if (!rootElement) {
	throw new Error("Root element not found");
}

const root = createRoot(rootElement);

root.render(
	<div>
		<Default />
	</div>,
);
