(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const toggle = document.querySelector("#show-inline-menu");

  if (toggle && !toggle.checked) {
    toggle.click();
  }

  await wait(2500);

  const after = document.querySelector("#show-inline-menu");

  return {
    checked: after?.checked,
    extra: [...document.querySelectorAll("input")].map(
      (element) => `${element.id}=${element.checked}`,
    ),
  };
})();
