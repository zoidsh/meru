(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const steps = [];

  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;

  const fill = (selector, value) => {
    const element = document.querySelector(selector);
    if (!element) {
      return false;
    }
    element.focus();
    setter.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.blur();
    return true;
  };

  const breaches = document.querySelector("#input-password-form_check-for-breaches");
  if (breaches?.checked) {
    breaches.click();
  }
  steps.push(["breachesUnchecked", breaches?.checked === false]);

  steps.push(["password", fill("#input-password-form_new-password", globalThis.__spikePassword)]);
  steps.push([
    "confirm",
    fill("#input-password-form_new-password-confirm", globalThis.__spikePassword),
  ]);
  await wait(800);

  const submit = [...document.querySelectorAll("button")].find((element) =>
    (element.innerText || "").trim().includes("Create account"),
  );
  submit?.click();
  steps.push(["submit", Boolean(submit)]);
  await wait(6000);

  steps.push(["url", location.href]);
  steps.push(["text", document.body.innerText.slice(0, 800)]);

  return steps;
})();
