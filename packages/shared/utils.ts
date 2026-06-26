export function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function clamp(num: number, min: number, max: number) {
  return Math.min(Math.max(num, min), max);
}
