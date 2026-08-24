/**
 * How large a tile label may be, in `cqw` against the board.
 *
 * Sizing on the longest word alone is not enough: "Power Company" has no long
 * word but stacks onto two lines, and at full size those two lines overflow the
 * tile. Stacked names therefore get their own, tighter ceilings.
 */
export function tileNameSize(name: string): number {
  const words = name.trim().split(/\s+/);
  const longest = Math.max(...words.map((w) => w.length));

  // the widest size that still fits the longest word on one line
  let size =
    longest >= 12 ? 1.05
    : longest >= 10 ? 1.2
    : longest >= 8 ? 1.4
    : 1.65;

  if (words.length >= 2) size = Math.min(size, 1.3);
  if (words.length >= 2 && name.length >= 12) size = Math.min(size, 1.15);
  if (words.length >= 3) size = Math.min(size, 1.0);

  return size;
}
