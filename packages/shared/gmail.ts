export const GMAIL_ACTION_CODE_MAP = {
	archive: 1,
	markAsRead: 3,
	delete: 9,
	markAsSpam: 7,
};

export const GMAIL_URL = "https://mail.google.com/mail/u/0";

export const GMAIL_COMPOSE_URL = `${GMAIL_URL}/?view=cm&fs=1`;

export const GMAIL_DELEGATED_ACCOUNT_URL_REGEXP = new RegExp(
	`${GMAIL_URL}/d/([^/]+)`,
);

export function createGmailDelegatedAccountUrl(delegatedAccountId: string) {
	return `${GMAIL_URL}/d/${delegatedAccountId}`;
}

export interface GmailMail {
	messageId: string;
	subject: string;
	summary: string;
	link: string;
	sender: {
		name: string;
		email: string;
	};
}

export type GmailState = {
	navigationHistory: {
		canGoBack: boolean;
		canGoForward: boolean;
	};
	unreadCount: number | null;
	outOfOffice: boolean;
	attentionRequired: boolean;
};
