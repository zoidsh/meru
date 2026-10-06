(async () => {
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

  const filled = fill("#self_hosted_env_settings_form_input_base_url", globalThis.__spikeServer);

  await new Promise((resolve) => setTimeout(resolve, 400));

  const save = [...document.querySelectorAll("button")].find(
    (element) => (element.innerText || "").trim() === "Save",
  );
  save?.click();

  await new Promise((resolve) => setTimeout(resolve, 2000));

  return { filled, saved: Boolean(save), text: document.body.innerText.slice(0, 700) };
})();
