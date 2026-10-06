(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;

  const field =
    document.querySelector("input[type=password]") || document.querySelector("#masterPassword");

  field.focus();
  setter.call(field, globalThis.__spikePassword);
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));

  await wait(500);

  const submit = [...document.querySelectorAll("button")].find((element) =>
    /^(Unlock|Log in)$/.test((element.innerText || "").trim()),
  );
  submit?.click();

  await wait(7000);

  return { url: location.href, text: document.body.innerText.slice(0, 700) };
})();
