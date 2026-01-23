import { GMAIL_COMPOSE_URL, GMAIL_PRELOAD_ARGUMENTS } from "@meru/shared/gmail";
import elementReady from "element-ready";

export async function initCompose() {
	if (process.argv.includes(GMAIL_PRELOAD_ARGUMENTS.openComposeInNewWindow)) {
		const composeButtonElement = await elementReady(".T-I.T-I-KE.L3", {
			stopOnDomReady: false,
		});

		if (composeButtonElement) {
			composeButtonElement.addEventListener("click", (event) => {
				event.stopPropagation();

				window.open(GMAIL_COMPOSE_URL);
			});
		}
	}
}
