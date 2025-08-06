import { ipc } from "@meru/renderer-lib/ipc";
import { useEffect } from "react";

export function useMouseAccountSwitching() {
	useEffect(() => {
		const handleMouseBackAndForward = (event: MouseEvent) => {
			if (event.button === 3 || event.button === 4) {
				ipc.main.send(
					event.button === 3
						? "accounts.selectPreviousAccount"
						: "accounts.selectNextAccount",
				);
			}
		};

		document.addEventListener("mousedown", handleMouseBackAndForward);

		return () => {
			document.removeEventListener("mousedown", handleMouseBackAndForward);
		};
	}, []);
}
