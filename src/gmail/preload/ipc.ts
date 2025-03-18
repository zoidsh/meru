import { ipcRenderer } from "electron";

export type RendererEvent =
	| {
			type: "go-to";
			destination:
				| "inbox"
				| "starred"
				| "snoozed"
				| "sent"
				| "drafts"
				| "important"
				| "scheduled"
				| "all"
				| "settings";
	  }
	| { type: "compose-email" };

ipcRenderer.on("ipc", (_event, event: RendererEvent) => {
	switch (event.type) {
		case "go-to": {
			window.location.hash = `#${event.destination}`;

			break;
		}
	}
});
