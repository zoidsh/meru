(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const steps = [];

  location.hash = "#/tabs/vault";
  await wait(3000);

  steps.push(["text", document.body.innerText.slice(0, 600)]);

  const item = [...document.querySelectorAll("button, a, bit-item")].find((element) =>
    (element.innerText || "").includes("Google"),
  );

  item?.click();
  steps.push(["clickedItem", Boolean(item)]);
  await wait(2500);

  steps.push(["afterUrl", location.href]);
  steps.push([
    "buttons",
    [...document.querySelectorAll("button, a")].map((element) =>
      (element.innerText || "").trim().slice(0, 40),
    ),
  ]);
  steps.push(["text2", document.body.innerText.slice(0, 600)]);

  return steps;
})();
