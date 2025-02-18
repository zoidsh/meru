import { useEffect, useState } from "react";
import { gmail } from "../lib/ipc";

export function useIsGmailHidden() {
	const [isGmailHidden, setIsGmailHidden] = useState(false);

	useEffect(() => {
		return gmail.onHiddenChanged(setIsGmailHidden);
	}, []);

	return isGmailHidden;
}
