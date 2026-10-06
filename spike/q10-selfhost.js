(async () => {
  const input = document.querySelector("#bit-form-field-2-search");
  input.focus();
  input.click();

  await new Promise((resolve) => setTimeout(resolve, 600));

  const option = [...document.querySelectorAll("[role=option]")].find((element) =>
    (element.innerText || "").includes("self-hosted"),
  );

  option?.click();

  await new Promise((resolve) => setTimeout(resolve, 1500));

  return {
    url: location.href,
    picked: Boolean(option),
    interactive: [...document.querySelectorAll("button, input")].map(
      (element) =>
        `${element.tagName.toLowerCase()}#${element.id}[${element.getAttribute("formcontrolname") ?? element.type}]"${(element.innerText || "").trim().slice(0, 40)}"`,
    ),
    text: document.body.innerText.slice(0, 800),
  };
})();
