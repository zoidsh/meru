export const GMAIL_ACTION_CODE_MAP = {
	archive: 1,
	markAsRead: 3,
	delete: 9,
	markAsSpam: 7,
};

export const GMAIL_URL = "https://mail.google.com/mail/u/0";

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
	attentionRequired: boolean;
};
