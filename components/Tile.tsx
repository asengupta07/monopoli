import { GROUP_COLORS } from '@/lib/board';
import { HOTEL_LEVEL } from '@/lib/rules';
import { tileNameSize } from '@/lib/labels';
import Flag from './Flag';
import {
  TileIcon, Plane, Zap, Droplets, Receipt, Gem, Gift, HelpCircle,
  Play, Lock, Palmtree, Skull, House, Hotel, type LucideIcon,
} from './icons';
import type { IconKey, Player, Tile as TileData, TileSide } from '@/types/game';

interface Props {
  index: number;
  tile: TileData;
  side: TileSide;
  col: number;
  row: number;
  owner?: Player | null;
  mortgaged?: boolean;
  houses?: number;
  /** True once one player owns every tile in this city's colour group. */
  setComplete?: boolean;
  /** That player's colour; null for airports/utilities, which have no group. */
  setColor?: string | null;
  highlight?: boolean;
  /** Someone else is spotlighted (see below) — fade into the background. */
  dim?: boolean;
  /** This tile belongs to the hovered sidebar player — glow instead of dimming. */
  spotlight?: boolean;
  /** Opens the property card; undefined for tiles nobody can own. */
  onOpen?: () => void;
}

export const ICONS: Record<IconKey, LucideIcon> = {
  plane: Plane,
  zap: Zap,
  droplets: Droplets,
  receipt: Receipt,
  gem: Gem,
  gift: Gift,
  help: HelpCircle,
  play: Play,
  lock: Lock,
  palm: Palmtree,
  skull: Skull,
};

function priceLabel(tile: TileData): string | null {
  if (tile.kind === 'tax') return tile.label;
  if (tile.kind === 'city' || tile.kind === 'airport' || tile.kind === 'utility') {
    return `${tile.price} $`;
  }
  return null;
}

export default function Tile({
  index, tile, side, col, row, owner, mortgaged, houses = 0,
  setComplete = false, setColor = null, highlight, dim, spotlight, onOpen,
}: Props) {
  const orientation = side === 't' || side === 'b' ? 'h' : 'v';
  // The tile's own glow always stays the group's brand colour — set
  // completion gets a separate, transient flash (below) rather than
  // recolouring the tile permanently. Once the flash fades, a completed set
  // looks exactly like any other owned tile.
  const glow = tile.kind === 'city' ? GROUP_COLORS[tile.group] : null;
  const price = priceLabel(tile);

  const nameClass =
    tile.kind === 'treasure' ? 'name treasure'
    : tile.kind === 'surprise' ? 'name surprise'
    : 'name';

  const badge =
    tile.kind === 'city'
      ? <Flag group={tile.group} />
      : tile.kind !== 'corner'
        ? <TileIcon icon={ICONS[tile.icon]} />
        : null;

  const label = (
    <div className={nameClass} style={{ fontSize: `${tileNameSize(tile.name)}cqw` }}>
      {tile.name}
    </div>
  );
  // Owning a tile hides its list price, but the chip stays as an invisible
  // spacer so the name never jumps — the price and the ownership badge below
  // must never share this flex slot, since it sits on the tile's outer edge,
  // which is exactly where the owner strip lives (see .owner-strip below).
  const priceEl = !price
    ? null
    : (
        <div
          className={owner ? 'price price-slot' : 'price'}
          aria-hidden={owner ? true : undefined}
        >
          {price}
        </div>
      );

  // outer board edge shows the price, inner edge shows the badge
  const outerFirst = side === 't' || side === 'l';

  const classes = ['tile', side, orientation];
  if (tile.kind === 'airport') classes.push('airport');
  if (tile.kind === 'utility') classes.push('utility');
  if (tile.kind === 'treasure') classes.push('is-treasure');
  if (tile.kind === 'surprise') classes.push('is-surprise');
  if (owner) classes.push('owned');
  if (mortgaged) classes.push('mortgaged');
  if (setComplete) classes.push('set-complete');
  if (highlight) classes.push('highlight');
  if (dim) classes.push('dim');
  if (spotlight) classes.push('spotlight-glow');

  return (
    <div
      className={classes.join(' ')}
      data-tile-index={index}
      onClick={onOpen}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={onOpen ? (e) => { if (e.key === 'Enter' || e.key === ' ') onOpen(); } : undefined}
      style={{
        gridColumn: col,
        gridRow: row,
        ...(owner ? ({ '--owner': owner.color } as React.CSSProperties) : {}),
      }}
      title={
        owner
          ? `${tile.name} — owned by ${owner.name}${mortgaged ? ' (mortgaged)' : ''}`
          : tile.name
      }
    >
      {glow && (
        <div className="glowwrap">
          <div
            className="glow"
            style={{ background: `radial-gradient(circle at 50% 55%, ${glow} 0%, transparent 62%)` }}
          />
        </div>
      )}

      {/* The strip alone is the ownership indicator — no extra badge on top. */}
      {owner && <span className="owner-strip" />}

      {/*
        A one-shot celebration, not a persistent state: this only exists in
        the tree for as long as `setComplete` is true. React mounts it fresh
        exactly once per completion (mount = animation start), and the CSS
        settles back to fully transparent on its own — no timer, no class
        toggling, so it can never "get stuck" mid-flash or replay on an
        unrelated re-render. If the set breaks up and completes again later,
        that is a new mount and rightly flashes again.
      */}
      {setComplete && setColor && (
        <span
          className="set-flash"
          style={{ '--set-color': setColor } as React.CSSProperties}
        />
      )}

      {houses > 0 && (
        <div className="tile-buildings">
          {houses >= HOTEL_LEVEL
            ? (
                <span className="tile-hotel" title="Hotel">
                  <Hotel strokeWidth={2.5} />
                </span>
              )
            : (
                <span className="tile-house" title={`${houses} house${houses > 1 ? 's' : ''}`}>
                  <House strokeWidth={2.5} />
                  {houses > 1 && <span className="tile-house-count">×{houses}</span>}
                </span>
              )}
        </div>
      )}

      <div className="inner">
        {outerFirst ? <>{priceEl}{label}{badge}</> : <>{badge}{label}{priceEl}</>}
      </div>
    </div>
  );
}
