import { gridPosition, TILES } from './board';

/**
 * Tile centres as a percentage of the board, computed from the grid definition
 * rather than measured from the DOM.
 *
 * Measuring meant tokens depended on layout timing and a ResizeObserver, and
 * anything that made the first measurement return zero left the pieces
 * invisible with no way to recover. The board is a known 11x11 grid, so the
 * geometry is arithmetic.
 *
 * These four numbers MUST match the `.board` rule in app/globals.css.
 */
export const BOARD_PADDING = 0.5;   // .board padding, in cqw
export const BOARD_GAP = 0.45;      // .board gap, in cqw
export const CORNER_FR = 1.55;      // corner track
export const TILE_FR = 1;           // every other track

const TRACKS = 11;
const GAPS = TRACKS - 1;
const TOTAL_FR = CORNER_FR * 2 + TILE_FR * (TRACKS - 2);

/** Percentage of the board left for tracks once padding and gaps are removed. */
const TRACK_SPACE = 100 - BOARD_PADDING * 2 - BOARD_GAP * GAPS;
const FR_UNIT = TRACK_SPACE / TOTAL_FR;

function trackSize(track: number): number {
  return (track === 1 || track === TRACKS ? CORNER_FR : TILE_FR) * FR_UNIT;
}

/** Centre of a 1-indexed grid track, as a percentage of the board. */
export function trackCentre(track: number): number {
  let offset = BOARD_PADDING;
  for (let t = 1; t < track; t++) {
    offset += trackSize(t) + BOARD_GAP;
  }
  return offset + trackSize(track) / 2;
}

export interface Point {
  x: number;
  y: number;
}

/** Centre of a tile, as percentages of the board's width and height. */
export function tileCentre(index: number): Point {
  const { col, row } = gridPosition(index);
  return { x: trackCentre(col), y: trackCentre(row) };
}

/** Every tile centre, indexed clockwise from START. */
export const TILE_CENTRES: Point[] = TILES.map((_, i) => tileCentre(i));
