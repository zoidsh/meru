export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const moveItem = <T>(
  items: readonly T[],
  from: number,
  to: number
): T[] => {
  if (items.length === 0) {
    return [];
  }
  const last = items.length - 1;
  const source = clamp(from, 0, last);
  const target = clamp(to, 0, last);
  const result = [...items];
  result.splice(target, 0, ...result.splice(source, 1));
  return result;
};
