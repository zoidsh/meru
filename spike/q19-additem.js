(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const steps = [];

  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;

  const fill = (element, value) => {
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

  const click = (pattern) => {
    const match = [...document.querySelectorAll("button, a, [role=menuitem]")].find((element) =>
      pattern.test((element.innerText || "").trim()),
    );
    match?.click();
    return match ? (match.innerText || "").trim().slice(0, 30) : null;
  };

  location.hash = "#/add-cipher?type=1";
  await wait(3000);

  steps.push(["url", location.href]);
  steps.push([
    "fields",
    [...document.querySelectorAll("input, textarea")].map(
      (element) => `${element.id}|${element.getAttribute("formcontrolname") ?? ""}|${element.type}`,
    ),
  ]);

  const byControl = (name) => document.querySelector(`[formcontrolname="${name}"]`);

  steps.push(["name", fill(byControl("name"), "Google")]);
  steps.push(["username", fill(byControl("username"), "spike@example.test")]);
  steps.push(["password", fill(byControl("password"), "GoogleSpikePassw0rd!")]);

  const uri = document.querySelector('[formcontrolname="uri"]');
  steps.push(["uri", fill(uri, "https://accounts.google.com")]);

  await wait(600);
  steps.push(["save", click(/^Save$/)]);
  await wait(5000);

  steps.push(["afterUrl", location.href]);
  steps.push(["text", document.body.innerText.slice(0, 500)]);

  return steps;
})();
