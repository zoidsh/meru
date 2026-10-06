(() => {
  const describe = (element) =>
    [
      element.tagName.toLowerCase(),
      element.id ? `#${element.id}` : "",
      element.getAttribute("formcontrolname")
        ? `[fc=${element.getAttribute("formcontrolname")}]`
        : "",
      element.type ? `[type=${element.type}]` : "",
      `"${(element.innerText || element.value || element.placeholder || "").slice(0, 60).replace(/\s+/g, " ")}"`,
    ].join("");

  return {
    url: location.href,
    interactive: [...document.querySelectorAll("button, input, select, a, bit-item")].map(describe),
    text: document.body.innerText.slice(0, 1200),
  };
})();
