class AppState {
	isQuitting = false;

	unreadMails = new Map<string, number>();

	accountsAttentionRequired = new Map<string, boolean>();

	listeners = {
		accountsAttentionRequiredChanged: new Set<
			(accountsAttentionRequired: typeof this.accountsAttentionRequired) => void
		>(),
	};

	getTotalUnreadMails() {
		return Array.from(this.unreadMails.values()).reduce((a, b) => a + b, 0);
	}

	onAccountsAttentionRequiredChanged(
		listener: (
			accountsAttentionRequired: typeof this.accountsAttentionRequired,
		) => void,
	) {
		this.listeners.accountsAttentionRequiredChanged.add(listener);

		return () => {
			this.listeners.accountsAttentionRequiredChanged.delete(listener);
		};
	}

	setAccountAttentionRequired(accountId: string, needsAttention: boolean) {
		this.accountsAttentionRequired.set(accountId, needsAttention);

		for (const listener of this.listeners.accountsAttentionRequiredChanged) {
			listener(this.accountsAttentionRequired);
		}
	}
}

export const appState = new AppState();
