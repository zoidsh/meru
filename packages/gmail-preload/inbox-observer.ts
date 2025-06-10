import type { GmailMessage } from "@meru/shared/gmail";
import { GMAIL_ACTION_CODE_MAP, GMAIL_URL } from "@meru/shared/gmail";
import elementReady from "element-ready";
import { $, $$ } from "select-dom";
import { ipc } from "./ipc";

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
let initialized = false;
const previousNewMessages = new Set<string>();

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

function parseFeed(feedDocument: Document) {
	const messages: GmailMessage[] = [];
	const newMessages: GmailMessage[] = [];

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

		const message: GmailMessage = {
			id: messageId,
			link,
			issuedAt: getDateFromNode(mail, "issued"),
			subject: getTextContentFromNode(mail, "title"),
			summary: getTextContentFromNode(mail, "summary"),
			sender: {
				name: getTextContentFromNode(mail, "name"),
				email: getTextContentFromNode(mail, "email"),
			},
		};

		messages.push(message);

		if (
			!previousNewMessages.has(message.id) &&
			currentDate - message.issuedAt < 60000
		) {
			previousNewMessages.add(message.id);

			setTimeout(
				() => {
					previousNewMessages.delete(message.id);
				},
				1000 * 60 * 5,
			);

			newMessages.push(message);
		}
	}

	return { messages, newMessages };
}

async function fetchInbox(unreadCount: number, retryAttempt = 0) {
	const isInboxSectioned = window.GM_INBOX_TYPE === "SECTIONED";
	const label = isInboxSectioned ? "/^sq_ig_i_personal" : "";
	const version = ++feedVersion;

	const feedDocument = await fetchGmail(`/feed/atom${label}?v=${version}`)
		.then(async (response) => response.text())
		.then((xmlString) => {
			const trustedXmlString = trustedPolicy.createHTML(xmlString);

			return domParser.parseFromString(String(trustedXmlString), "text/xml");
		});

	const { messages, newMessages } = parseFeed(feedDocument);

	if (messages.length !== unreadCount && retryAttempt < 3) {
		await new Promise((res) => {
			setTimeout(res, 500);
		});

		return fetchInbox(unreadCount, retryAttempt + 1);
	}

	ipc.main.send("gmail.updateFeed", messages);

	if (!initialized) {
		initialized = true;

		return;
	}

	if (newMessages.length > 0) {
		ipc.main.send("gmail.notifyNewMessages", newMessages);
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
			ipc.main.send("gmail.setUnreadCount", currentUnreadCount);

			fetchInbox(currentUnreadCount);

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

	if ((await res.text()).includes("spreauth")) {
		window.location.href = "https://mail.google.com/mail/u/0/spreauth";
	}
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

	ipc.renderer.on("gmail.handleMessage", async (_event, messageId, action) => {
		await sendMailAction(messageId, action);

		refreshInbox();
	});
}
