(() => {
  const r = document.querySelector("#identifierId").getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
})();
