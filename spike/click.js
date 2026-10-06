(() => {
  const label = globalThis.__spikeLabel;
  const match = [...document.querySelectorAll("button, a, bit-item, [role=button]")].find(
    (element) => (element.innerText || "").trim().toLowerCase().includes(label.toLowerCase()),
  );
  if (!match) {
    return { clicked: null };
  }
  match.click();
  return { clicked: (match.innerText || "").trim().slice(0, 40) };
})();
