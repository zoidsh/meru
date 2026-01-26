import { GMAIL_COMPOSE_URL, GMAIL_PRELOAD_ARGUMENTS } from "@meru/shared/gmail";
import { $ } from "select-dom";
import {
	createElementNotProcessedSelector,
	createElementProcessedAttributeFromPreloadArgument,
} from "./lib/utils";

const isOpenComposeInNewWindowEnabled = process.argv.includes(
	GMAIL_PRELOAD_ARGUMENTS.openComposeInNewWindow,
);

const composeButtonProcessedAttribute =
	createElementProcessedAttributeFromPreloadArgument(
		GMAIL_PRELOAD_ARGUMENTS.openComposeInNewWindow,
	);

const composeButtonElementSelector = createElementNotProcessedSelector(
	".T-I.T-I-KE.L3",
	composeButtonProcessedAttribute,
);

export async function openComposeInNewWindow() {
	if (!isOpenComposeInNewWindowEnabled) {
		return;
	}

	const composeButtonElement = $(composeButtonElementSelector);

	if (!composeButtonElement) {
		return;
	}

	composeButtonElement.setAttribute(composeButtonProcessedAttribute, "");

	composeButtonElement.addEventListener("click", (event) => {
		event.stopPropagation();

		window.open(GMAIL_COMPOSE_URL);
	});
}
