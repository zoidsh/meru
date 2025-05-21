import { GMAIL_URL } from "@meru/shared/gmail";
import type { GmailMail } from "@meru/shared/gmail";
import { GMAIL_ACTION_CODE_MAP } from "@meru/shared/gmail";
import elementReady from "element-ready";
import { $, $$ } from "select-dom";
import { ipcMain, ipcRenderer } from "./ipc";

declare global {
	interface Window {
		GM_INBOX_TYPE: "CLASSIC" | "SECTIONED";
		GM_ID_KEY: string;
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
		ipcMain.send("gmail.handleNewMessages", newMails);
	}
}

async function observeInbox() {
	const inboxAnchorElement = await elementReady(inboxAnchorElementSelector, {
		stopOnDomReady: false,
		timeout: 60000,
	});

	const inboxAnchorContainerElement =
		inboxAnchorElement?.parentElement?.parentElement?.parentElement
			?.parentElement?.parentElement?.parentElement;

	if (!inboxAnchorContainerElement) {
		return;
	}

	const getUnreadCount = () => {
		const unreadCountElement = document.querySelector(
			`div:has(> ${inboxAnchorElementSelector}) .bsU`,
		);

		const currentUnreadCount = Number(
			unreadCountElement?.textContent?.replace(/\D/, "") || "0",
		);

		if (previousUnreadCount !== currentUnreadCount) {
			ipcMain.send("gmail.setUnreadCount", currentUnreadCount);

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

let gmailIdKey: string | undefined;

async function fetchGmailIdKey() {
	if (!gmailIdKey) {
		const gmailDocument = await fetchGmail().then((res) => res.text());

		gmailIdKey = /var GM_ID_KEY = '([a-z0-9]+)';/.exec(gmailDocument)?.[1];
	}
}

async function sendMailAction(
	mailId: string,
	action: keyof typeof GMAIL_ACTION_CODE_MAP,
) {
	await fetchGmailIdKey();

	if (!gmailIdKey) {
		throw new Error("ID key is missing");
	}

	const gmailActionToken = document.cookie
		.split("; ")
		.find((row) => row.startsWith("GMAIL_AT="))
		?.split("=")[1];

	if (!gmailActionToken) {
		throw new Error("Action token is missing");
	}

	const command = "l:all";
	const labels: [] = [];
	const ids: [] = [];
	const actionCode = GMAIL_ACTION_CODE_MAP[action];

	const body = new FormData();

	body.append(
		"s_jr",
		JSON.stringify([
			null,
			[
				[
					null,
					null,
					null,
					[null, actionCode, mailId, mailId, command, [], labels, ids],
				],
				[null, null, null, null, null, null, [null, true, false]],
				[null, null, null, null, null, null, [null, true, false]],
			],
			2,
			null,
			null,
			null,
			gmailIdKey,
		]),
	);

	const res = await fetchGmail(
		`/s/?v=or&ik=${gmailIdKey}&at=${gmailActionToken}&subui=chrome&hl=en&ts=${Date.now()}`,
		{
			method: "POST",
			credentials: "include",
			body,
		},
	);

	await res.text();
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

export function initInboxObserver() {
	observeInbox();

	ipcRenderer.on("gmail.handleMessage", async (_event, messageId, action) => {
		await sendMailAction(messageId, action);

		refreshInbox();
	});
}
