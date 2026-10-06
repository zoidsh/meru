(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  location.hash = "#/autofill";
  await wait(3000);

  return {
    url: location.href,
    controls: [...document.querySelectorAll("input, select, button")].map(
      (element) =>
        `${element.tagName.toLowerCase()}#${element.id}[${element.type}]${element.checked === undefined ? "" : element.checked}="${(element.innerText || element.value || "").trim().slice(0, 40)}"`,
    ),
    text: document.body.innerText.slice(0, 900),
  };
})();
