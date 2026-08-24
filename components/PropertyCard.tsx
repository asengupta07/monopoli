'use client';

import { useEffect } from 'react';
import { X, Hammer, Landmark, BadgeDollarSign, Home, Hotel } from 'lucide-react';
import { TILES, GROUP_COLORS, isOwnable, gridPosition, groupMembers } from '@/lib/board';
import { tileCentre } from '@/lib/geometry';
import {
  AIRPORT_RENTS, UTILITY_MULTIPLIERS, HOTEL_LEVEL,
  cityRent, rentWithHouses, houseCost, sellValue, mortgageValue, unmortgageCost,
} from '@/lib/rules';
import Flag from './Flag';
import type { GameActions } from '@/hooks/useGameSocket';
import type { Player, RoomState } from '@/types/game';

interface Row {
  when: string;
  get: string;
  active?: boolean;
}

/** The rent ladder for a property, straight from the tables the engine uses. */
function rentRows(index: number, state: RoomState): Row[] {
  const tile = TILES[index];
  const level = state.ownership[index]?.houses ?? 0;

  if (tile.kind === 'airport') {
    return AIRPORT_RENTS.map((rent, i) => ({
      when: i === 0 ? 'one airport is owned' : `${i + 1} airports are owned`,
      get: `$${rent}`,
    }));
  }

  if (tile.kind === 'utility') {
    return UTILITY_MULTIPLIERS.map((multiplier, i) => ({
      when: i === 0 ? 'one utility is owned' : 'both utilities are owned',
      get: `${multiplier}x dice`,
    }));
  }

  if (tile.kind === 'city') {
    const rows: Row[] = [
      { when: 'with rent', get: `$${cityRent(tile.price)}`, active: level === 0 },
    ];
    if (state.settings.x2Rent) {
      rows.push({ when: 'with the full set', get: `$${cityRent(tile.price) * 2}` });
    }
    for (let houses = 1; houses <= HOTEL_LEVEL; houses++) {
      rows.push({
        when: houses === HOTEL_LEVEL
          ? 'with a hotel'
          : `with ${houses} house${houses > 1 ? 's' : ''}`,
        get: `$${rentWithHouses(tile.price, houses)}`,
        active: level === houses,
      });
    }
    return rows;
  }

  return [];
}

export default function PropertyCard({
  index, state, me, actions, onClose,
}: {
  index: number;
  state: RoomState;
  me: Player | null;
  actions: GameActions;
  onClose: () => void;
}) {
  const tile = TILES[index];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!isOwnable(tile)) return null;

  const centre = tileCentre(index);
  const { side } = gridPosition(index);
  const owned = state.ownership[index];
  const owner = owned ? state.players.find((p) => p.id === owned.ownerId) ?? null : null;
  const rows = rentRows(index, state);

  const { sellRate, mortgageRate, mortgageInterest, mortgage: mortgageOn, evenBuild } = state.settings;
  const level = owned?.houses ?? 0;
  const mortgaged = Boolean(owned?.mortgaged);
  const mine = Boolean(me && owned?.ownerId === me.id);
  const playable = state.phase === 'playing' && Boolean(me?.alive);
  const cash = me?.cash ?? 0;

  // building needs the whole set, unmortgaged, and (optionally) an even spread
  const set = tile.kind === 'city' ? groupMembers(tile.group) : [];
  const holdsSet = set.length > 0 && set.every((i) => state.ownership[i]?.ownerId === me?.id);
  const setClean = set.every((i) => !state.ownership[i]?.mortgaged);
  const levels = set.map((i) => state.ownership[i]?.houses ?? 0);
  const build = tile.kind === 'city' ? houseCost(tile.group) : 0;

  const canBuild = mine && playable && tile.kind === 'city' && holdsSet && setClean
    && level < HOTEL_LEVEL && cash >= build
    && (!evenBuild || level <= Math.min(...levels));

  const canSellHouse = mine && playable && tile.kind === 'city' && level > 0
    && (!evenBuild || level >= Math.max(...levels));

  const canSellProperty = mine && playable && level === 0 && !mortgaged;
  const canMortgage = mine && playable && mortgageOn && !mortgaged && level === 0;
  const canLift = mine && playable && mortgageOn && mortgaged
    && cash >= unmortgageCost(tile.price, mortgageRate, mortgageInterest);

  // Open the card towards the middle of the board so it never leaves the frame.
  const placement =
    side === 't' ? { left: `${centre.x}%`, top: `${centre.y + 6}%`, translate: '-50% 0' }
    : side === 'b' ? { left: `${centre.x}%`, top: `${centre.y - 6}%`, translate: '-50% -100%' }
    : side === 'l' ? { left: `${centre.x + 6}%`, top: `${centre.y}%`, translate: '0 -50%' }
    : { left: `${centre.x - 6}%`, top: `${centre.y}%`, translate: '-100% -50%' };

  const accent =
    tile.kind === 'city' ? GROUP_COLORS[tile.group]
    : tile.kind === 'airport' ? '#7fb0ff'
    : '#5fd9f0';

  return (
    <>
      <button className="property-scrim" aria-label="Close" onClick={onClose} />
      <div
        className={`property-card side-${side}`}
        style={{
          left: placement.left,
          top: placement.top,
          translate: placement.translate,
          ['--accent' as string]: accent,
        }}
        role="dialog"
        aria-label={tile.name}
      >
        <button className="property-close" onClick={onClose} aria-label="Close">
          <X size={14} />
        </button>

        <div className="property-head">
          {tile.kind === 'city' && <Flag group={tile.group} />}
          <div className="property-name">{tile.name}</div>
        </div>

        {level > 0 && (
          <div className="property-buildings">
            {level === HOTEL_LEVEL ? (
              <span className="building hotel"><Hotel size={13} /> Hotel</span>
            ) : (
              Array.from({ length: level }, (_, i) => (
                <span key={i} className="building"><Home size={12} /></span>
              ))
            )}
          </div>
        )}

        <div className="property-table">
          <div className="property-row heading"><span>when</span><span>get</span></div>
          {rows.map((row) => (
            <div key={row.when} className={`property-row${row.active ? ' on' : ''}`}>
              <span>{row.when}</span>
              <span className="amount">{row.get}</span>
            </div>
          ))}
        </div>

        <div className="property-foot">
          <div className="property-stat">
            <span className="k">Price</span>
            <span className="v">${tile.price}</span>
          </div>
          {tile.kind === 'city' && (
            <div className="property-stat">
              <span className="k">House</span>
              <span className="v">${build}</span>
            </div>
          )}
          <div className="property-stat">
            <span className="k">Owner</span>
            <span className="v owner">
              {owner ? (
                <>
                  <i style={{ background: owner.color }} />
                  {owner.name}
                  {mortgaged && <em>mortgaged</em>}
                </>
              ) : 'nobody'}
            </span>
          </div>
        </div>

        {mine && (
          <div className="property-actions">
            {tile.kind === 'city' && (
              <>
                <button
                  className="property-action build"
                  disabled={!canBuild}
                  onClick={() => actions.build(index)}
                  title={holdsSet ? `Costs $${build}` : 'You need the whole set to build'}
                >
                  <Hammer size={13} />
                  {level + 1 === HOTEL_LEVEL ? 'Buy hotel' : 'Buy house'} ${build}
                </button>
                <button
                  className="property-action"
                  disabled={!canSellHouse}
                  onClick={() => actions.sellHouse(index)}
                >
                  <Home size={13} />
                  Sell {level === HOTEL_LEVEL ? 'hotel' : 'house'} ${sellValue(build, sellRate)}
                </button>
              </>
            )}

            {mortgageOn && (
              mortgaged ? (
                <button
                  className="property-action"
                  disabled={!canLift}
                  onClick={() => actions.unmortgage(index)}
                  title={`Loan plus ${mortgageInterest}% interest`}
                >
                  <Landmark size={13} />
                  Pay off ${unmortgageCost(tile.price, mortgageRate, mortgageInterest)}
                </button>
              ) : (
                <button
                  className="property-action"
                  disabled={!canMortgage}
                  onClick={() => actions.mortgage(index)}
                  title={`Raises ${mortgageRate}% of the price`}
                >
                  <Landmark size={13} />
                  Mortgage ${mortgageValue(tile.price, mortgageRate)}
                </button>
              )
            )}

            <button
              className="property-action sell"
              disabled={!canSellProperty}
              onClick={() => actions.sellProperty(index)}
              title={
                mortgaged ? 'Lift the mortgage before selling'
                : level > 0 ? 'Sell the buildings first'
                : `The bank pays ${sellRate}% of the price`
              }
            >
              <BadgeDollarSign size={13} />
              Sell ${sellValue(tile.price, sellRate)}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
