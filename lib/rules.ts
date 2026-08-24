import type { GameSettings, GroupKey } from '@/types/game';

/**
 * Pure rule values and maths shared by the client and the server.
 *
 * This module must stay free of Node built-ins: components import it, and
 * `gameEngine.ts` (which uses node:crypto) must never be pulled into the
 * browser bundle just to read a constant.
 */

export const PLAYER_COLORS = [
  '#e6b455', '#5b8def', '#e07a3f', '#e35b5b',
  '#3f79c9', '#4fc6d8', '#5bd67a', '#7a5be0',
  '#a35b3f', '#e05ba3', '#e894b0', '#8b5be0',
];

export const STARTING_CASH = 1500;
export const STARTING_CASH_OPTIONS = [500, 1000, 1500, 2000, 2500, 3000, 5000];
export const MAX_PLAYER_OPTIONS = [2, 3, 4, 5, 6, 8, 10, 12];

/**
 * How long the table has to answer a bid. Every bid restarts the clock; when it
 * runs out the standing bid wins, and an auction nobody bids on simply expires.
 */
export const AUCTION_WINDOW_MS = 10_000;

/**
 * Rent tables. The engine computes rent from these, and the property card
 * displays them, so what a player is shown is what they will actually pay.
 */
export const AIRPORT_RENTS = [25, 50, 100, 200];
export const UTILITY_MULTIPLIERS = [4, 10];

/** A city's base rent is a tenth of its price. */
export function cityRent(price: number): number {
  return Math.round(price * 0.1);
}

/* ---------------- building ---------------- */

/** Four houses, then a hotel. */
export const MAX_HOUSES = 4;
export const HOTEL_LEVEL = MAX_HOUSES + 1;

/**
 * What one house costs on each set, scaled by where the set sits on the board:
 * the cheap opening streets build cheaply, the expensive final ones do not.
 */
export const HOUSE_COST_BY_GROUP: Record<GroupKey, number> = {
  brazil: 50,
  israel: 50,
  italy: 100,
  germany: 100,
  china: 150,
  france: 150,
  uk: 200,
  usa: 200,
};

/**
 * Rent multipliers against the base rent for 1-4 houses and a hotel. The steep
 * jump at three houses is what makes the third house the one worth racing for,
 * as in the classic game.
 */
export const HOUSE_RENT_MULTIPLIERS = [5, 15, 45, 62.5, 75];

export function houseCost(group: GroupKey): number {
  return HOUSE_COST_BY_GROUP[group];
}

/** Rent for a city at a given build level (0 = bare land, 5 = hotel). */
export function rentWithHouses(price: number, houses: number): number {
  const base = cityRent(price);
  if (houses <= 0) return base;
  const multiplier = HOUSE_RENT_MULTIPLIERS[Math.min(houses, HOTEL_LEVEL) - 1];
  return Math.round((base * multiplier) / 5) * 5;
}

/* ---------------- money back ---------------- */

/**
 * Rates the host sets before the game. They are percentages so the lobby can
 * offer them as plain numbers.
 */
export const SELL_RATE_OPTIONS = [25, 50, 75, 100];
export const MORTGAGE_RATE_OPTIONS = [30, 40, 50, 60, 70];
export const MORTGAGE_INTEREST_OPTIONS = [0, 5, 10, 15, 20, 25];

/** What the bank pays to take a property (or a house) back. */
export function sellValue(price: number, sellRate: number): number {
  return Math.floor((price * sellRate) / 100);
}

/** What mortgaging a property raises. */
export function mortgageValue(price: number, mortgageRate: number): number {
  return Math.floor((price * mortgageRate) / 100);
}

/** The loan plus interest, which is what it costs to lift a mortgage. */
export function unmortgageCost(price: number, mortgageRate: number, interest: number): number {
  return Math.ceil(mortgageValue(price, mortgageRate) * (1 + interest / 100));
}

export const DEFAULT_SETTINGS: GameSettings = {
  maxPlayers: 4,
  isPrivate: true,
  map: 'Classic',
  x2Rent: false,
  vacationCash: false,
  auction: true,
  noRentInPrison: false,
  mortgage: true,
  evenBuild: true,
  startingCash: STARTING_CASH,
  randomizeOrder: true,
  sellRate: 50,
  mortgageRate: 50,
  mortgageInterest: 10,
};
