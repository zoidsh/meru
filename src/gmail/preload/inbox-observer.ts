import { GMAIL_URL } from "@/lib/constants";
import elementReady from "element-ready";
import { $, $$ } from "select-dom";
import type { GmailMail } from "..";
import { ipcMain, ipcRenderer } from "./ipc";

declare global {
	interface Window {
		GM_INBOX_TYPE: "CLASSIC" | "SECTIONED";
	}
}

if (!window.trustedTypes) {
	throw new Error("Trusted Types API not found");
}

const trustedPolicy = window.trustedTypes.createPolicy("default", {
	createHTML: (string: string) => string,
});

const domParser = new DOMParser();

const inboxAnchorElementSelector = 'span > a[href*="#inbox"]';

let previousUnreadCount: null | number = null;
let inboxAnchorContainerElementObserver: MutationObserver;
let feedVersion = 0;
let previousModifiedFeedDate = 0;
let currentModifiedFeedDate = 0;
let isInitialNewMailsFetch = true;
const previousNewMails = new Set<string>();

function getTextContentFromNode(node: Document | Element, selector: string) {
	return node.querySelector(selector)?.textContent?.trim() ?? "";
}

export function getNumberFromNode(node: Document | Element, selector: string) {
	const content = getTextContentFromNode(node, selector);

	return content ? Number(content) : 0;
}

function getDateFromNode(node: Document | Element, selector: string) {
	return new Date(getTextContentFromNode(node, selector)).getTime();
}

async function fetchGmail(
	path = "",
	fetchOptions?: Parameters<typeof fetch>[1],
) {
	return fetch(`${GMAIL_URL}${path}`, fetchOptions);
}

function parseNewMails(feedDocument: Document) {
	const newMails: GmailMail[] = [];
	const mails = $$("entry", feedDocument);
	const currentDate = Date.now();

	for (const mail of mails) {
		const link = $("link", mail)?.getAttribute("href");

		if (!link) {
			throw new Error("Link not found");
		}

		const messageId = new URLSearchParams(link).get("message_id");

		if (!messageId) {
			throw new Error("Message ID not found");
		}

		if (previousNewMails.has(messageId)) {
			continue;
		}

		const issuedDate = getDateFromNode(mail, "issued");

		if (currentDate - issuedDate < 60000) {
			previousNewMails.add(messageId);

			const newMail = {
				messageId,
				link,
				subject: getTextContentFromNode(mail, "title"),
				summary: getTextContentFromNode(mail, "summary"),
				sender: {
					name: getTextContentFromNode(mail, "name"),
					email: getTextContentFromNode(mail, "email"),
				},
			};

			newMails.push(newMail);
		}
	}

	return newMails;
}

async function fetchInbox() {
	const isInboxSectioned = window.GM_INBOX_TYPE === "SECTIONED";
	const label = isInboxSectioned ? "/^sq_ig_i_personal" : "";
	const version = ++feedVersion;

	const feedDocument = await fetchGmail(`/feed/atom${label}?v=${version}`)
		.then(async (response) => response.text())
		.then((xmlString) => {
			const trustedXmlString = trustedPolicy.createHTML(xmlString);

			return domParser.parseFromString(String(trustedXmlString), "text/xml");
		});

	previousModifiedFeedDate = currentModifiedFeedDate;
	currentModifiedFeedDate = getDateFromNode(feedDocument, "modified");

	const isFeedModified = previousModifiedFeedDate !== currentModifiedFeedDate;

	if (!isFeedModified) {
		return;
	}

	const newMails = parseNewMails(feedDocument);

	if (isInitialNewMailsFetch) {
		isInitialNewMailsFetch = false;

		return;
	}

	if (newMails.length > 0) {
		ipcMain.send("gmail.receivedNewMails", newMails);
	}
}

async function observeInbox() {
	const inboxAnchorElement = await elementReady(inboxAnchorElementSelector, {
		stopOnDomReady: false,
	});

	const inboxAnchorContainerElement =
		inboxAnchorElement?.parentElement?.parentElement?.parentElement
			?.parentElement?.parentElement?.parentElement;

	if (!inboxAnchorContainerElement) {
		throw new Error("Inbox anchor wrapper element not found");
	}

	const getUnreadCount = () => {
		const unreadCountElement =
			inboxAnchorContainerElement.querySelector(".bsU");

		const currentUnreadCount = Number(unreadCountElement?.textContent || "0");

		if (previousUnreadCount !== currentUnreadCount) {
			ipcMain.send("gmail.updateUnreadMails", currentUnreadCount);

			fetchInbox();

			previousUnreadCount = currentUnreadCount;
		}
	};

	getUnreadCount();

	inboxAnchorContainerElementObserver = new MutationObserver(() => {
		getUnreadCount();
	});

	inboxAnchorContainerElementObserver.observe(inboxAnchorContainerElement, {
		childList: true,
	});
}

export const mailActionsMap = {
	archive: "rc_^i",
	markAsRead: "rd",
	delete: "tr",
	markAsSpam: "sp",
};

let mailActionToken: string | undefined;

async function fetchActionToken() {
	if (!mailActionToken) {
		const gmailDocument = await fetchGmail().then(async (response) =>
			response.text(),
		);

		mailActionToken = /var GM_ACTION_TOKEN="([\w-]+)";/.exec(
			gmailDocument,
		)?.[1];
	}
}

async function sendMailAction(
	mailId: string,
	action: keyof typeof mailActionsMap,
) {
	await fetchActionToken();

	if (!mailActionToken) {
		throw new Error("Action token is missing");
	}

	const parameters = new URLSearchParams({
		t: mailId,
		at: mailActionToken,
		act: mailActionsMap[action],
	}).toString();

	return fetchGmail(`?${parameters}`);
}

function getInboxAnchorElement() {
	return document.querySelector<HTMLAnchorElement>(inboxAnchorElementSelector);
}

function refreshInbox() {
	if (window.location.hash.startsWith("#inbox")) {
		const inboxAnchorElement = getInboxAnchorElement();

		if (inboxAnchorElement) {
			inboxAnchorElement.click();
		}
	}
}

window.document.addEventListener("DOMContentLoaded", () => {
	observeInbox();

	ipcRenderer.on("gmail.mail.quickAction", async (_event, mailId, action) => {
		await sendMailAction(mailId, action);

		refreshInbox();
	});

	ipcMain.send("gmail.receivedNewMails", [
		{
			messageId: "195cd4b7104810e6",
			link: "https://mail.google.com/mail/u/0?account_id=tim@cheung.io&message_id=195cd4b7104810e6&view=conv&extsrc=atom",
			subject: "Haha",
			summary: "Cool",
			sender: {
				name: "Tim Cheung",
				email: "timchedev@gmail.com",
			},
		},
	]);
});
