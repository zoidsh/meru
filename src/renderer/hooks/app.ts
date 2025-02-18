import { useEffect, useState } from "react";
import { app } from "../lib/ipc";
import type { NavigationHistory } from "../../main/preload";

export function useAppTitle() {
	const [title, setTitle] = useState("");

	useEffect(() => {
		return app.onTitleChanged(setTitle);
	}, []);

	return title;
}

export function useAppNavigationHistory() {
	const [navigationHistory, setNavigationHistory] = useState<NavigationHistory>(
		{ canGoBack: false, canGoForward: false },
	);

	useEffect(() => {
		return app.onNavigationHistoryChanged(setNavigationHistory);
	}, []);

	return navigationHistory;
}
