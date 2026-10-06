(async () => {
  const input = document.querySelector("#bit-form-field-2-search");
  input.focus();
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(input, "");
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.click();

  await new Promise((resolve) => setTimeout(resolve, 900));

  return {
    options: [...document.querySelectorAll("[role=option]")].map((element) =>
      (element.innerText || "").trim().slice(0, 60),
    ),
    text: document.body.innerText.slice(0, 600),
  };
})();
