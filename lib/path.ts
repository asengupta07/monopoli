import { TILES } from './board';

/** A dice roll can never exceed 12, so a longer jump is a card or a trip to prison. */
export const MAX_WALK = 12;

/**
 * The tiles a piece visits travelling from `from` to `to`, excluding the square
 * it starts on.
 *
 * Movement is always forward around the ring, one tile at a time. Because the
 * tile centres along an edge are colinear and a corner sits at the intersection
 * of two edges, stepping through every square makes a move of "two right, three
 * down" trace an L — the piece turns at the corner instead of cutting across
 * the board on the diagonal.
 *
 * Jumps that no dice roll could produce (cards, going to prison) return a single
 * destination so the piece is placed rather than marched around the board.
 */
export function walkPath(from: number, to: number, size: number = TILES.length): number[] {
  const start = ((from % size) + size) % size;
  const end = ((to % size) + size) % size;
  if (start === end) return [];

  const distance = (end - start + size) % size;
  if (distance > MAX_WALK) return [end];

  const path: number[] = [];
  for (let step = 1; step <= distance; step++) {
    path.push((start + step) % size);
  }
  return path;
}

/** True when the move is a step-by-step walk rather than a jump. */
export function isWalk(from: number, to: number, size: number = TILES.length): boolean {
  const distance = ((to - from + size) % size + size) % size;
  return distance > 0 && distance <= MAX_WALK;
}
