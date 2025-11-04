import { ipc } from "@meru/renderer-lib/ipc";
import { useEffect } from "react";
import { useConfig } from "./react-query";
import { useTrialStore } from "./stores";

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

export function useIsLicenseKeyValid() {
	const { config } = useConfig();

	const isTrialActive = useTrialStore((state) => Boolean(state.daysLeft));

	return isTrialActive || Boolean(config?.licenseKey);
}
