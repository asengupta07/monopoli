import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import AuctionCard from '../components/AuctionCard';
import { DEFAULT_SETTINGS, AUCTION_WINDOW_MS } from '../lib/rules';
import type { GameActions } from '../hooks/useGameSocket';
import type { PendingAuction, Player, RoomState } from '../types/game';

const noop = () => {};
const actions = new Proxy({}, { get: () => noop }) as GameActions;

function player(id: string, name: string, cash = 1500): Player {
  return {
    id, name, color: '#5bd67a', cash, pos: 0,
    inPrison: false, jailTurns: 0, alive: true, connected: true,
  };
}

const ana = player('a', 'Ana');
const ben = player('b', 'Ben');
const cal = player('c', 'Cal', 40);

function stateWith(auction: PendingAuction): RoomState {
  return {
    id: 'test',
    phase: 'playing',
    hostId: ana.id,
    settings: DEFAULT_SETTINGS,
    players: [ana, ben, cal],
    order: [ana.id, ben.id, cal.id],
    currentPlayerId: ana.id,
    dice: [1, 2],
    pending: auction,
    ownership: {},
    vacationPot: 0,
    winner: null,
    log: [],
    chat: [],
    trades: [],
    composing: [],
    voteKick: null,
  };
}

function auctionOf(overrides: Partial<PendingAuction> = {}): PendingAuction {
  return {
    type: 'auction',
    tileIndex: 3, // Rio, lists at $60
    highestBid: 0,
    highestBidderId: null,
    participants: [ana.id, ben.id, cal.id],
    passed: [],
    rollerId: ana.id,
    endsAt: Date.now() + AUCTION_WINDOW_MS,
    endsIn: AUCTION_WINDOW_MS,
    ...overrides,
  };
}

const render = (auction: PendingAuction, me: Player | null) =>
  renderToStaticMarkup(
    <AuctionCard auction={auction} state={stateWith(auction)} me={me} actions={actions} />,
  );

test('an open auction shows the property and that bidding starts at $1', () => {
  const html = render(auctionOf(), ana);
  assert.ok(html.includes('Rio'), 'names the property');
  assert.ok(html.includes('list $60'), 'shows the list price for reference');
  assert.ok(html.includes('opens at $1'), 'bidding starts at $1');
  assert.ok(html.includes('Bid $1'), 'the first bid button offers $1');
});

test('every participant is listed, including whoever declined the property', () => {
  const html = render(auctionOf(), ben);
  for (const name of ['Ana', 'Ben', 'Cal']) {
    assert.ok(html.includes(name), `${name} is shown in the auction`);
  }
});

test('the standing bid and its bidder are shown to everyone', () => {
  const html = render(auctionOf({ highestBid: 75, highestBidderId: ben.id }), cal);
  assert.ok(html.includes('$75'), 'shows the standing bid');
  assert.ok(html.includes('Ben'), 'names the leader');
  assert.ok(html.includes('auction-chip leading'), 'marks the leader');
});

test('the next bid must beat the standing one', () => {
  const html = render(auctionOf({ highestBid: 75, highestBidderId: ben.id }), ana);
  assert.ok(html.includes('Bid $76'), 'defaults to the minimum raise');
  assert.ok(html.includes('min="76"'), 'the input floor is the minimum raise');
});

test('a bidder can never be offered more than they hold', () => {
  // Cal has $40 against a standing bid of $20
  const html = render(auctionOf({ highestBid: 20, highestBidderId: ben.id }), cal);
  assert.ok(html.includes('max="40"'), 'the input is capped at their cash');
  assert.ok(html.includes('Your cash $40'));
});

test('a player who cannot reach the minimum is told, and gets no bid controls', () => {
  const broke = player('c', 'Cal', 5);
  const html = render(auctionOf({ highestBid: 50, highestBidderId: ben.id }), broke);
  assert.ok(html.includes('can&#x27;t reach $51') || html.includes("can't reach $51"));
  assert.ok(!html.includes('auction-slider'), 'no bidding controls when unaffordable');
});

/** The opening tag of the button whose label is `label`. */
function buttonTagFor(html: string, label: string): string {
  const labelAt = html.indexOf(`<span>${label}</span>`);
  assert.notEqual(labelAt, -1, `no button labelled ${label}`);
  const tagStart = html.lastIndexOf('<button', labelAt);
  return html.slice(tagStart, html.indexOf('>', tagStart) + 1);
}

test('the leader cannot pass on their own bid', () => {
  const asLeader = render(auctionOf({ highestBid: 30, highestBidderId: ana.id }), ana);
  assert.ok(
    buttonTagFor(asLeader, 'Pass').includes('disabled'),
    'Pass is disabled for the highest bidder',
  );

  const asRival = render(auctionOf({ highestBid: 30, highestBidderId: ben.id }), ana);
  assert.ok(
    !buttonTagFor(asRival, 'Pass').includes('disabled'),
    'anyone not leading may pass',
  );
});

test('a player who passed sees that they are out, with no controls', () => {
  const html = render(auctionOf({ passed: [ben.id] }), ben);
  assert.ok(html.includes('You passed'));
  assert.ok(!html.includes('auction-slider'), 'no bidding controls once passed');
  assert.ok(html.includes('auction-chip passed'), 'the chip shows they folded');
});

test('a spectator sees the auction but cannot bid in it', () => {
  const outsider = player('z', 'Zed');
  const html = render(auctionOf(), outsider);
  assert.ok(html.includes('not part of this auction'));
  assert.ok(!html.includes('auction-slider'));
});
