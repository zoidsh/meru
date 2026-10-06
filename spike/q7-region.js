(() => {
  const trigger =
    document.querySelector("bit-form-field button") ||
    document.querySelector("[role=combobox]") ||
    document.querySelectorAll("button")[0];
  trigger?.click();
  return {
    trigger: trigger?.outerHTML.slice(0, 400),
    afterText: document.body.innerText.slice(0, 900),
  };
})();
