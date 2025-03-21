class AppState {
	isQuitting = false;

	unreadMails = new Map<string, number>();

	getTotalUnreadMails() {
		return Array.from(this.unreadMails.values()).reduce((a, b) => a + b, 0);
	}
}

export const appState = new AppState();
