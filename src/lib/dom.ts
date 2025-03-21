export function clickElement(selector: string) {
	const element = document.querySelector<HTMLDivElement>(selector);
	if (element) {
		element.click();
	}
}
