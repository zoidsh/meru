(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const steps = [];

  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;

  const regionButton = [...document.querySelectorAll("button")].find((element) =>
    /bitwarden\.com|bitwarden\.eu|self-hosted/.test((element.innerText || "").trim()),
  );
  regionButton?.click();
  steps.push(["regionButton", Boolean(regionButton)]);
  await wait(900);

  const option = [...document.querySelectorAll("[role=option], button, li")].find((element) =>
    (element.innerText || "").trim().includes("self-hosted"),
  );
  option?.click();
  steps.push(["selfHostedOption", Boolean(option)]);
  await wait(1500);

  const baseUrl = document.querySelector("#self_hosted_env_settings_form_input_base_url");
  if (baseUrl) {
    baseUrl.focus();
    setter.call(baseUrl, globalThis.__spikeServer);
    baseUrl.dispatchEvent(new Event("input", { bubbles: true }));
    baseUrl.dispatchEvent(new Event("change", { bubbles: true }));
    baseUrl.blur();
  }
  steps.push(["baseUrlField", Boolean(baseUrl)]);
  await wait(500);

  const save = [...document.querySelectorAll("button")].find(
    (element) => (element.innerText || "").trim() === "Save",
  );
  save?.click();
  steps.push(["save", Boolean(save)]);
  await wait(2500);

  return { steps, url: location.href, text: document.body.innerText.slice(0, 700) };
})();
