// Stamped on the document rather than exposed, so styles can make room for the
// macOS traffic lights without the page reaching anything of the preload's.
window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.dataset.platform = process.platform;
});
