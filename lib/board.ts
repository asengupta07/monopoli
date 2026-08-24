import type {
  AirportTile,
  CardTile,
  CityTile,
  CornerKey,
  CornerTile,
  GroupKey,
  IconKey,
  Ownership,
  TaxTile,
  Tile,
  TileSide,
  UtilityTile,
} from '@/types/game';

// Board definition shared by client (rendering) and server (rules).
// Tiles are listed clockwise from START.

export const GROUP_COLORS: Record<GroupKey, string> = {
  brazil: '#37b26b',
  israel: '#4a86e8',
  italy: '#d94f6a',
  germany: '#e0a83f',
  france: '#4a6fe0',
  china: '#e0453f',
  uk: '#8a5be0',
  usa: '#4f7fd6',
};

const city = (name: string, price: number, group: GroupKey): CityTile =>
  ({ kind: 'city', name, price, group });
const airport = (name: string, price: number): AirportTile =>
  ({ kind: 'airport', name, price, icon: 'plane' });
const utility = (name: string, price: number, icon: IconKey): UtilityTile =>
  ({ kind: 'utility', name, price, icon });
const tax = (name: string, amount: number, icon: IconKey, label: string): TaxTile =>
  ({ kind: 'tax', name, amount, icon, label });
const treasure = (): CardTile => ({ kind: 'treasure', name: 'Treasure', icon: 'gift' });
const surprise = (): CardTile => ({ kind: 'surprise', name: 'Surprise', icon: 'help' });
const corner = (key: CornerKey, name: string, icon: IconKey): CornerTile =>
  ({ kind: 'corner', key, name, icon });

export const TILES: Tile[] = [
  corner('start', 'START', 'play'),                 // 0
  city('Salvador', 60, 'brazil'),           // 1
  treasure(),                                     // 2
  city('Rio', 60, 'brazil'),                // 3
  tax('Earnings Tax', 200, 'receipt', '%10'),           // 4
  airport('TLV Airport', 200),                    // 5
  city('Tel Aviv', 100, 'israel'),          // 6
  city('Haifa', 110, 'israel'),             // 7
  surprise(),                                     // 8
  city('Jerusalem', 120, 'israel'),         // 9
  corner('jail', 'In Prison', 'lock'),               // 10
  city('Venice', 130, 'italy'),             // 11
  utility('Power Company', 150, 'zap'),             // 12
  city('Milan', 140, 'italy'),              // 13
  city('Rome', 160, 'italy'),               // 14
  airport('MUC Airport', 200),                    // 15
  city('Frankfurt', 180, 'germany'),        // 16
  treasure(),                                     // 17
  city('Munich', 190, 'germany'),           // 18
  city('Berlin', 200, 'germany'),           // 19
  corner('vacation', 'Vacation', 'palm'),            // 20
  city('Shenzhen', 210, 'china'),           // 21
  surprise(),                                     // 22
  city('Beijing', 220, 'china'),            // 23
  city('Shanghai', 240, 'china'),           // 24
  airport('CDG Airport', 200),                    // 25
  city('Lyon', 260, 'france'),              // 26
  utility('Water Company', 150, 'droplets'),            // 27
  city('Toulouse', 270, 'france'),          // 28
  city('Paris', 280, 'france'),             // 29
  corner('goToJail', 'Go to prison', 'skull'),        // 30
  city('Liverpool', 290, 'uk'),             // 31
  city('Manchester', 300, 'uk'),            // 32
  treasure(),                                     // 33
  city('London', 320, 'uk'),                // 34
  airport('JFK Airport', 200),                    // 35
  surprise(),                                     // 36
  city('San Francisco', 360, 'usa'),        // 37
  tax('Premium Tax', 75, 'gem', '$75'),             // 38
  city('New York', 400, 'usa'),             // 39
];

export const JAIL_INDEX = 10;
export const VACATION_INDEX = 20;
export const START_BONUS = 200;
export const MAX_JAIL_TURNS = 3;

export function isOwnable(tile: Tile): tile is CityTile | AirportTile | UtilityTile {
  return tile.kind === 'city' || tile.kind === 'airport' || tile.kind === 'utility';
}

/** A flat colour swatch for a property, for compact list rows (sidebar, trade UI). */
export function swatchColor(tile: Tile): string {
  if (tile.kind === 'city') return GROUP_COLORS[tile.group];
  if (tile.kind === 'airport') return '#5c7fa8';
  if (tile.kind === 'utility') return '#2f97ad';
  return '#555';
}

/** Every tile index belonging to one colour group. */
export function groupMembers(group: GroupKey): number[] {
  const out: number[] = [];
  TILES.forEach((t, i) => {
    if (t.kind === 'city' && t.group === group) out.push(i);
  });
  return out;
}

/**
 * Grid placement for a clockwise index on the 11x11 CSS grid:
 * corners take the extremes, nine tiles fill each edge between them.
 */
export function gridPosition(index: number): { col: number; row: number; side: TileSide } {
  if (index === 0) return { col: 1, row: 1, side: 'corner' };
  if (index < 10) return { col: index + 1, row: 1, side: 't' };
  if (index === 10) return { col: 11, row: 1, side: 'corner' };
  if (index < 20) return { col: 11, row: index - 9, side: 'r' };
  if (index === 20) return { col: 11, row: 11, side: 'corner' };
  if (index < 30) return { col: 31 - index, row: 11, side: 'b' };
  if (index === 30) return { col: 1, row: 11, side: 'corner' };
  return { col: 1, row: 41 - index, side: 'l' };
}

/** Clockwise travel: the way a piece looks while standing on this square. */
export type TravelFacing = 'right' | 'down' | 'left' | 'up';

export function travelFacing(index: number): TravelFacing {
  const { side } = gridPosition(index);
  if (side === 't') return 'right';
  if (side === 'r') return 'down';
  if (side === 'b') return 'left';
  if (side === 'l') return 'up';
  if (index === 10) return 'down';
  if (index === 20) return 'left';
  if (index === 30) return 'up';
  return 'right';
}

/**
 * The player who owns every tile of a colour group, or null if the set is
 * split, incomplete, or nobody owns it yet. Pure and client-safe (unlike the
 * server's `ownsFullGroup`, which needs a whole Room) so the board can light
 * up a completed set as soon as the snapshot says so.
 */
export function fullSetOwner(
  ownership: Record<number, Ownership>,
  group: GroupKey,
): string | null {
  const members = groupMembers(group);
  const first = ownership[members[0]]?.ownerId;
  if (!first) return null;
  return members.every((i) => ownership[i]?.ownerId === first) ? first : null;
}
