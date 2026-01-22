const elementId = "meru-account-color";

export function initAccountColorIndicator(color: string) {
	if (document.getElementById(elementId)) {
		return;
	}

	const accountColorElement = document.createElement("div");

	accountColorElement.id = elementId;

	accountColorElement.style.position = "fixed";
	accountColorElement.style.top = "0";
	accountColorElement.style.left = "0";
	accountColorElement.style.right = "0";
	accountColorElement.style.height = "4px";
	accountColorElement.style.backgroundColor = color;
	accountColorElement.style.zIndex = "999999";

	document.body.appendChild(accountColorElement);
}
