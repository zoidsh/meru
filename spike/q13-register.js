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

  const click = (label) => {
    const match = [...document.querySelectorAll("button, a")].find(
      (element) => (element.innerText || "").trim() === label,
    );
    match?.click();
    return Boolean(match);
  };

  steps.push(["createAccount", click("Create account")]);
  await wait(1500);

  steps.push(["email", fill("#register-start_form_input_email", globalThis.__spikeEmail)]);
  steps.push(["name", fill("#register-start_form_input_name", "Spike")]);
  await wait(400);
  steps.push(["continue", click("Continue")]);
  await wait(3500);

  steps.push(["url", location.href]);
  steps.push([
    "fields",
    [...document.querySelectorAll("input")].map(
      (element) => `${element.id}[${element.getAttribute("formcontrolname") ?? element.type}]`,
    ),
  ]);
  steps.push(["text", document.body.innerText.slice(0, 700)]);

  return steps;
})();
