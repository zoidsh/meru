(async () => {
  const input = document.querySelector("#bit-form-field-2-search");
  input.focus();
  input.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
  input.click();

  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(input, globalThis.__spikeServer);
  input.dispatchEvent(new Event("input", { bubbles: true }));

  await new Promise((resolve) => setTimeout(resolve, 900));

  const options = [...document.querySelectorAll("[role=option], bit-option, li")].map((element) =>
    (element.innerText || "").trim().slice(0, 60),
  );

  return { value: input.value, options, text: document.body.innerText.slice(0, 700) };
})();
