const elementId = "meru-account-color";

export function setAccountColorIndicator(color: string | null) {
  const existingElement = document.getElementById(elementId);

  if (!color) {
    existingElement?.remove();

    return;
  }

  if (existingElement) {
    existingElement.style.backgroundColor = color;

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
