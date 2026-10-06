(() => {
  const elements = [...document.body.children].filter((element) =>
    /-/.test(element.tagName.toLowerCase()),
  );

  return elements.map((element) => {
    const rect = element.getBoundingClientRect();
    const root = element.shadowRoot;
    return {
      tag: element.tagName.toLowerCase(),
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      },
      shadow: root
        ? [...root.querySelectorAll("iframe")].map((frame) => frame.src.slice(0, 70))
        : "closed-or-none",
    };
  });
})();
