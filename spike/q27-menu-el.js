(() => {
  const element = [...document.body.children].find((candidate) =>
    /^[a-z]{6,}-[a-z]{2}$/.test(candidate.tagName.toLowerCase()),
  );

  if (!element) {
    return { found: false, children: [...document.body.children].map((c) => c.tagName) };
  }

  const rect = element.getBoundingClientRect();
  const root = element.shadowRoot;

  return {
    found: true,
    tag: element.tagName.toLowerCase(),
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    style: element.getAttribute("style")?.slice(0, 300),
    shadow: root
      ? [...root.children].map((child) => `${child.tagName}:${child.src ?? ""}`.slice(0, 120))
      : null,
  };
})();
