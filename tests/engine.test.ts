import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createRoom,
  addPlayer,
  removePlayer,
  setAppearance,
  updateSettings,
  startGame,
  rollDice,
  buyProperty,
  skipProperty,
  placeBid,
  passAuction,
  dropFromAuction,
  expireAuction,
  minimumBid,
  endTurn,
  mortgageProperty,
  unmortgageProperty,
  declareBankrupt,
  sendChat,
  MAX_CHAT,
  calcRent,
  currentPlayerId,
  getPlayer,
  serialize,
} from '../lib/gameEngine';
import {
  PLAYER_COLORS, AUCTION_WINDOW_MS, DEFAULT_SETTINGS,
  mortgageValue, unmortgageCost,
} from '../lib/rules';
import type { PendingAuction, Player, Room } from '../types/game';

/* ---------------------------------------------------------------- */
/* helpers                                                           */
/* ---------------------------------------------------------------- */

function makeRoom(playerNames = ['Ana', 'Ben']): { room: Room; players: Player[] } {
  const room = createRoom(new Set(), 'testid');
  const players = playerNames.map((name) => {
    const { player, error } = addPlayer(room, { name });
    assert.ok(player, error);
    return player;
  });
  return { room, players };
}

/** Start a game with a deterministic turn order (join order). */
function startDeterministic(room: Room, hostId: string) {
  const res = updateSettings(room, hostId, { randomizeOrder: false });
  assert.equal(res.error, undefined);
  const started = startGame(room, hostId);
  assert.equal(started.error, undefined);
}

/** Force a dice outcome so movement tests are not flaky. */
function withDice(values: number[], fn: () => void) {
  const original = Math.random;
  let i = 0;
  // rollDice pulls two randoms; map each to the desired face
  Math.random = () => {
    const face = values[i % values.length];
    i++;
    return (face - 1) / 6 + 0.001;
  };
  try {
    fn();
  } finally {
    Math.random = original;
  }
}

/* ---------------------------------------------------------------- */
/* lobby                                                             */
/* ---------------------------------------------------------------- */

test('the first player to join becomes the host', () => {
  const { room, players } = makeRoom();
  assert.equal(room.hostId, players[0].id);
});

test('players get distinct colours and the room fills to its cap', () => {
  const room = createRoom(new Set(), 'r');
  updateSettings(room, room.hostId ?? '', {});
  for (let i = 0; i < 4; i++) addPlayer(room, { name: `P${i}` });
  const colours = new Set(room.players.map((p) => p.color));
  assert.equal(colours.size, 4);

  const overflow = addPlayer(room, { name: 'Late' });
  assert.equal(overflow.error, 'Room is full');
  assert.equal(room.players.length, 4);
});

test('an appearance already in use cannot be taken', () => {
  const { room, players } = makeRoom();
  const taken = players[0].color;
  assert.equal(setAppearance(room, players[1].id, taken).error, 'Appearance already taken');

  const free = PLAYER_COLORS.find((c) => !room.players.some((p) => p.color === c))!;
  assert.equal(setAppearance(room, players[1].id, free).error, undefined);
  assert.equal(getPlayer(room, players[1].id)?.color, free);
});

test('only the host may change settings or start the game', () => {
  const { room, players } = makeRoom();
  assert.equal(
    updateSettings(room, players[1].id, { x2Rent: true }).error,
    'Only the host can change settings',
  );
  assert.equal(startGame(room, players[1].id).error, 'Only the host can start the game');
});

test('a game needs at least two players', () => {
  const room = createRoom(new Set(), 'r');
  const { player } = addPlayer(room, { name: 'Solo' });
  assert.equal(startGame(room, player!.id).error, 'Need at least 2 players');
});

test('settings validation rejects out-of-range and unknown values', () => {
  const { room, players } = makeRoom();
  const host = players[0].id;

  updateSettings(room, host, { maxPlayers: 99 });
  assert.equal(room.settings.maxPlayers, 4, 'above the allowed range is ignored');

  updateSettings(room, host, { maxPlayers: 1 });
  assert.equal(room.settings.maxPlayers, 4, 'below two players is ignored');

  updateSettings(room, host, { startingCash: 1234 });
  assert.equal(room.settings.startingCash, 1500, 'a value not on the list is ignored');

  updateSettings(room, host, { startingCash: 3000 });
  assert.equal(room.settings.startingCash, 3000);

  // bots were removed from the game; the patch must not reintroduce the key
  updateSettings(room, host, { allowBots: true } as never);
  assert.ok(!('allowBots' in room.settings));
});

test('maxPlayers cannot be set below the number of seated players', () => {
  const { room, players } = makeRoom(['A', 'B', 'C']);
  updateSettings(room, players[0].id, { maxPlayers: 2 });
  assert.equal(room.settings.maxPlayers, 4, 'would have evicted a seated player');
});

test('changing starting cash restocks everyone in the lobby', () => {
  const { room, players } = makeRoom();
  updateSettings(room, players[0].id, { startingCash: 2500 });
  for (const p of room.players) assert.equal(p.cash, 2500);
});

test('starting cash applies to players who joined before the change', () => {
  const { room, players } = makeRoom();
  updateSettings(room, players[0].id, { startingCash: 500, randomizeOrder: false });
  startGame(room, players[0].id);
  for (const p of room.players) assert.equal(p.cash, 500);
});

test('randomize player order off preserves join order', () => {
  const { room, players } = makeRoom(['A', 'B', 'C', 'D']);
  startDeterministic(room, players[0].id);
  assert.deepEqual(room.order, players.map((p) => p.id));
});

test('randomize player order on keeps every player exactly once', () => {
  const { room, players } = makeRoom(['A', 'B', 'C', 'D']);
  startGame(room, players[0].id);
  assert.equal(room.order.length, 4);
  assert.deepEqual([...room.order].sort(), players.map((p) => p.id).sort());
});

/* ---------------------------------------------------------------- */
/* turns and movement                                                */
/* ---------------------------------------------------------------- */

test('rolling out of turn is rejected', () => {
  const { room, players } = makeRoom();
  startDeterministic(room, players[0].id);
  const notMyTurn = room.order[1];
  assert.equal(rollDice(room, notMyTurn).error, 'Not your turn');
});

test('a roll moves the player and offers the property they land on', () => {
  const { room, players } = makeRoom();
  startDeterministic(room, players[0].id);
  const first = players[0];

  withDice([1, 2], () => rollDice(room, first.id)); // 1 + 2 = 3 -> Rio
  assert.equal(getPlayer(room, first.id)?.pos, 3);
  assert.equal(room.pending?.type, 'buy');
  assert.equal(room.pending?.tileIndex, 3);
  assert.equal(room.pending?.type === 'buy' && room.pending.playerId, first.id);
});

test('buying deducts the price, records ownership and passes the turn', () => {
  const { room, players } = makeRoom();
  startDeterministic(room, players[0].id);
  const [ana, ben] = players;

  withDice([1, 2], () => rollDice(room, ana.id)); // Rio, $60
  assert.equal(buyProperty(room, ana.id).error, undefined);

  assert.equal(getPlayer(room, ana.id)?.cash, 1440);
  assert.equal(room.ownership[3]?.ownerId, ana.id);
  assert.equal(room.ownership[3]?.mortgaged, false);
  assert.equal(room.pending, null);
  assert.equal(currentPlayerId(room), ben.id, 'turn advances after resolving');
});

test('another player cannot resolve someone else pending purchase', () => {
  const { room, players } = makeRoom();
  startDeterministic(room, players[0].id);
  withDice([1, 2], () => rollDice(room, players[0].id));
  assert.equal(buyProperty(room, players[1].id).error, 'Not your decision');
  assert.equal(skipProperty(room, players[1].id).error, 'Not your decision');
});

test('rolling again is blocked while a purchase is pending', () => {
  const { room, players } = makeRoom();
  startDeterministic(room, players[0].id);
  withDice([1, 2], () => rollDice(room, players[0].id));
  assert.equal(
    rollDice(room, players[0].id).error,
    'Resolve the current property first',
  );
});

test('doubles keep the turn with the roller', () => {
  const { room, players } = makeRoom();
  startDeterministic(room, players[0].id);
  const ana = players[0];

  // 2+2 lands on Earnings Tax (index 4): a fee, so no purchase is pending
  withDice([2, 2], () => rollDice(room, ana.id));
  assert.equal(room.pending, null);
  assert.equal(currentPlayerId(room), ana.id, 'doubles keep the turn');
  assert.equal(room.doublesCount, 1);
});

test('a third double in a row sends the roller to prison', () => {
  const { room, players } = makeRoom();
  startDeterministic(room, players[0].id);
  const ana = players[0];
  room.doublesCount = 2; // two doubles already banked this turn

  withDice([2, 2], () => rollDice(room, ana.id));
  assert.equal(getPlayer(room, ana.id)?.inPrison, true);
  assert.equal(getPlayer(room, ana.id)?.pos, 10);
  assert.equal(getPlayer(room, ana.id)?.jailTurns, 0);
  assert.notEqual(currentPlayerId(room), ana.id, 'turn ends on the third double');
});

// A card that relocates the player must resolve the tile it drops them on,
// otherwise a free property would be silently skipped.
test('a card that moves the player resolves the destination tile', () => {
  const { room, players } = makeRoom();
  startDeterministic(room, players[0].id);
  const ana = players[0];
  getPlayer(room, ana.id)!.pos = 4;

  // 4 + 2+2 -> index 8 (Surprise); the stubbed randomness draws "trip to TLV Airport"
  withDice([2, 2], () => rollDice(room, ana.id));

  assert.equal(getPlayer(room, ana.id)?.pos, 5, 'card relocated the player');
  assert.equal(room.pending?.tileIndex, 5, 'the airport is offered for purchase');
});

test('landing on Go to prison jails the player and ends the turn', () => {
  const { room, players } = makeRoom();
  startDeterministic(room, players[0].id);
  const ana = players[0];
  getPlayer(room, ana.id)!.pos = 25;

  withDice([2, 3], () => rollDice(room, ana.id)); // 25 + 5 = 30
  assert.equal(getPlayer(room, ana.id)?.pos, 10);
  assert.equal(getPlayer(room, ana.id)?.inPrison, true);
  assert.notEqual(currentPlayerId(room), ana.id);
});

test('passing START pays the bonus', () => {
  const { room, players } = makeRoom();
  startDeterministic(room, players[0].id);
  const ana = players[0];
  const player = getPlayer(room, ana.id)!;
  player.pos = 38;
  const before = player.cash;

  withDice([1, 3], () => rollDice(room, ana.id)); // 38 + 4 -> wraps to 2
  assert.equal(player.pos, 2);
  assert.ok(player.cash >= before + 200 - 100, 'START bonus paid before any card effect');
});

test('a player in prison who does not roll doubles stays put', () => {
  const { room, players } = makeRoom();
  startDeterministic(room, players[0].id);
  const ana = getPlayer(room, players[0].id)!;
  ana.inPrison = true;
  ana.pos = 10;

  withDice([1, 2], () => rollDice(room, ana.id));
  assert.equal(ana.inPrison, true);
  assert.equal(ana.pos, 10, 'does not move while jailed');
  assert.equal(ana.jailTurns, 1);
});

test('rolling doubles releases a player from prison', () => {
  const { room, players } = makeRoom();
  startDeterministic(room, players[0].id);
  const ana = getPlayer(room, players[0].id)!;
  ana.inPrison = true;
  ana.pos = 10;

  withDice([3, 3], () => rollDice(room, ana.id));
  assert.equal(ana.inPrison, false);
  assert.equal(ana.pos, 16, 'moves out of prison by the roll');
});

test('the third failed prison roll costs $50 and frees the player', () => {
  const { room, players } = makeRoom();
  startDeterministic(room, players[0].id);
  const ana = getPlayer(room, players[0].id)!;
  ana.inPrison = true;
  ana.pos = 10;
  ana.jailTurns = 2;
  const before = ana.cash;

  withDice([1, 2], () => rollDice(room, ana.id));
  assert.equal(ana.inPrison, false);
  assert.equal(ana.cash, before - 50);
});

test('endTurn is refused when a purchase is still pending', () => {
  const { room, players } = makeRoom();
  startDeterministic(room, players[0].id);
  withDice([1, 2], () => rollDice(room, players[0].id));
  assert.equal(endTurn(room, players[0].id).error, 'Resolve the current property first');
});

/* ---------------------------------------------------------------- */
/* rent                                                              */
/* ---------------------------------------------------------------- */

test('city rent is a tenth of the price, doubled on a full set when enabled', () => {
  const { room, players } = makeRoom();
  const [ana] = players;
  startDeterministic(room, ana.id);

  room.ownership[1] = { ownerId: ana.id, houses: 0, mortgaged: false }; // Salvador $60
  assert.equal(calcRent(room, 1, 7), 6);

  room.ownership[3] = { ownerId: ana.id, houses: 0, mortgaged: false }; // Rio, set complete
  assert.equal(calcRent(room, 1, 7), 6, 'x2 is off by default');

  room.settings.x2Rent = true;
  assert.equal(calcRent(room, 1, 7), 12);
});

test('airport rent doubles with each airport owned', () => {
  const { room, players } = makeRoom();
  const [ana] = players;
  const airports = [5, 15, 25, 35];
  const expected = [25, 50, 100, 200];

  airports.forEach((idx, i) => {
    room.ownership[idx] = { ownerId: ana.id, houses: 0, mortgaged: false };
    assert.equal(calcRent(room, airports[0], 7), expected[i]);
  });
});

test('utility rent scales with the dice and the number owned', () => {
  const { room, players } = makeRoom();
  const [ana] = players;
  room.ownership[12] = { ownerId: ana.id, houses: 0, mortgaged: false };
  assert.equal(calcRent(room, 12, 9), 36, 'one utility: 4x dice');

  room.ownership[27] = { ownerId: ana.id, houses: 0, mortgaged: false };
  assert.equal(calcRent(room, 12, 9), 90, 'both utilities: 10x dice');
});

test('rent moves cash from the visitor to the owner', () => {
  const { room, players } = makeRoom();
  const [ana, ben] = players;
  startDeterministic(room, ana.id);
  room.ownership[3] = { ownerId: ben.id, houses: 0, mortgaged: false }; // Rio, rent 6

  const anaBefore = getPlayer(room, ana.id)!.cash;
  const benBefore = getPlayer(room, ben.id)!.cash;

  withDice([1, 2], () => rollDice(room, ana.id));
  assert.equal(getPlayer(room, ana.id)!.cash, anaBefore - 6);
  assert.equal(getPlayer(room, ben.id)!.cash, benBefore + 6);
});

test('no rent is charged while the owner sits in prison when that rule is on', () => {
  const { room, players } = makeRoom();
  const [ana, ben] = players;
  startDeterministic(room, ana.id);
  room.settings.noRentInPrison = true;
  room.ownership[3] = { ownerId: ben.id, houses: 0, mortgaged: false };
  getPlayer(room, ben.id)!.inPrison = true;

  const before = getPlayer(room, ana.id)!.cash;
  withDice([1, 2], () => rollDice(room, ana.id));
  assert.equal(getPlayer(room, ana.id)!.cash, before);
});

/* ---------------------------------------------------------------- */
/* mortgages                                                         */
/* ---------------------------------------------------------------- */

test('mortgaging pays half the price and stops rent', () => {
  const { room, players } = makeRoom();
  const [ana, ben] = players;
  startDeterministic(room, ana.id);
  room.ownership[3] = { ownerId: ben.id, houses: 0, mortgaged: false }; // Rio $60

  const benBefore = getPlayer(room, ben.id)!.cash;
  assert.equal(mortgageProperty(room, ben.id, 3).error, undefined);
  assert.equal(getPlayer(room, ben.id)!.cash, benBefore + mortgageValue(60, DEFAULT_SETTINGS.mortgageRate));
  assert.equal(room.ownership[3].mortgaged, true);
  assert.equal(calcRent(room, 3, 7), 0);

  const anaBefore = getPlayer(room, ana.id)!.cash;
  withDice([1, 2], () => rollDice(room, ana.id));
  assert.equal(getPlayer(room, ana.id)!.cash, anaBefore, 'no rent on a mortgaged tile');
});

test('lifting a mortgage costs the loan plus interest', () => {
  const { room, players } = makeRoom();
  const [ana] = players;
  startDeterministic(room, ana.id);
  room.ownership[39] = { ownerId: ana.id, houses: 0, mortgaged: true }; // New York $400

  const before = getPlayer(room, ana.id)!.cash;
  assert.equal(unmortgageProperty(room, ana.id, 39).error, undefined);
  assert.equal(getPlayer(room, ana.id)!.cash, before - unmortgageCost(400, DEFAULT_SETTINGS.mortgageRate, DEFAULT_SETTINGS.mortgageInterest));
  assert.equal(room.ownership[39].mortgaged, false);
  assert.ok(unmortgageCost(400, DEFAULT_SETTINGS.mortgageRate, DEFAULT_SETTINGS.mortgageInterest) > mortgageValue(400, DEFAULT_SETTINGS.mortgageRate), 'interest makes it dearer');
});

test('mortgage actions are guarded', () => {
  const { room, players } = makeRoom();
  const [ana, ben] = players;
  startDeterministic(room, ana.id);
  room.ownership[3] = { ownerId: ana.id, houses: 0, mortgaged: false };

  assert.equal(mortgageProperty(room, ben.id, 3).error, 'You do not own that property');
  assert.equal(unmortgageProperty(room, ana.id, 3).error, 'That property is not mortgaged');

  mortgageProperty(room, ana.id, 3);
  assert.equal(mortgageProperty(room, ana.id, 3).error, 'Already mortgaged');

  getPlayer(room, ana.id)!.cash = 0;
  assert.match(unmortgageProperty(room, ana.id, 3).error ?? '', /You need \$\d+/);
});

test('mortgages can be switched off for a game', () => {
  const { room, players } = makeRoom();
  const [ana] = players;
  updateSettings(room, ana.id, { mortgage: false, randomizeOrder: false });
  startGame(room, ana.id);
  room.ownership[3] = { ownerId: ana.id, houses: 0, mortgaged: false };

  assert.equal(
    mortgageProperty(room, ana.id, 3).error,
    'Mortgages are disabled in this game',
  );
});

/* ---------------------------------------------------------------- */
/* auctions, bankruptcy, chat                                        */
/* ---------------------------------------------------------------- */

/** Land Ana on Rio and decline it, which opens the auction. */
function openRioAuction(names = ['Ana', 'Ben', 'Cal']) {
  const { room, players } = makeRoom(names);
  startDeterministic(room, players[0].id);
  withDice([1, 2], () => rollDice(room, players[0].id));
  skipProperty(room, players[0].id);
  const auction = room.pending;
  assert.ok(auction && auction.type === 'auction', 'skipping should open an auction');
  return { room, players, auction: auction as PendingAuction };
}

test('declining a property opens an auction to every seated player', () => {
  const { room, players, auction } = openRioAuction();

  assert.equal(auction.tileIndex, 3);
  assert.equal(auction.highestBid, 0, 'bidding opens with no standing bid');
  assert.equal(auction.highestBidderId, null);
  assert.deepEqual(
    [...auction.participants].sort(),
    players.map((p) => p.id).sort(),
    'the player who declined still gets to bid',
  );
  assert.equal(minimumBid(auction), 1, 'bidding starts at $1');
  assert.equal(room.pending?.type, 'auction');
});

test('any participant may bid, and the highest bid leads', () => {
  const { room, players } = openRioAuction();
  const [ana, ben, cal] = players;

  assert.equal(placeBid(room, ben.id, 1).error, undefined);
  assert.equal((room.pending as PendingAuction).highestBid, 1);
  assert.equal((room.pending as PendingAuction).highestBidderId, ben.id);

  assert.equal(placeBid(room, cal.id, 25).error, undefined);
  assert.equal((room.pending as PendingAuction).highestBidderId, cal.id);

  // the player who declined the property can still win it at auction
  assert.equal(placeBid(room, ana.id, 40).error, undefined);
  assert.equal((room.pending as PendingAuction).highestBidderId, ana.id);
});

test('a bid must beat the standing bid and fit the bidder cash', () => {
  const { room, players } = openRioAuction();
  const [, ben, cal] = players;

  placeBid(room, ben.id, 30);
  assert.equal(placeBid(room, cal.id, 30).error, 'Bid must be at least $31');
  assert.equal(placeBid(room, cal.id, 0).error, 'Bid must be at least $31');

  getPlayer(room, cal.id)!.cash = 50;
  assert.equal(placeBid(room, cal.id, 80).error, 'You only have $50');
  assert.equal(placeBid(room, cal.id, 50).error, undefined, 'may bid every last dollar');
});

test('the winner pays their bid, not the list price', () => {
  const { room, players } = openRioAuction();
  const [ana, ben, cal] = players;
  const benBefore = getPlayer(room, ben.id)!.cash;

  placeBid(room, ben.id, 12);        // Rio lists at $60
  passAuction(room, cal.id);
  passAuction(room, ana.id);

  assert.equal(room.pending, null, 'auction settled');
  assert.equal(room.ownership[3]?.ownerId, ben.id);
  assert.equal(getPlayer(room, ben.id)!.cash, benBefore - 12);
});

test('the leader cannot pass on their own bid', () => {
  const { room, players } = openRioAuction();
  const [, ben] = players;
  placeBid(room, ben.id, 5);
  assert.equal(passAuction(room, ben.id).error, 'You are the highest bidder');
});

test('a property nobody bids on stays unowned and the turn moves on', () => {
  const { room, players } = openRioAuction();
  const [ana, ben, cal] = players;

  passAuction(room, ben.id);
  passAuction(room, cal.id);
  passAuction(room, ana.id);

  assert.equal(room.pending, null);
  assert.equal(room.ownership[3], undefined);
  assert.notEqual(currentPlayerId(room), ana.id, 'the turn advances once it settles');
});

test('a player who already passed cannot bid again', () => {
  const { room, players } = openRioAuction();
  const [, ben] = players;
  passAuction(room, ben.id);
  assert.equal(placeBid(room, ben.id, 50).error, 'You already passed');
  assert.equal(passAuction(room, ben.id).error, 'You already passed');
});

test('someone outside the auction cannot bid', () => {
  const { room } = openRioAuction();
  assert.equal(placeBid(room, 'not-a-player', 5).error, 'You are not in this auction');
});

test('a disconnect cannot stall a live auction', () => {
  const { room, players } = openRioAuction();
  const [ana, ben, cal] = players;

  placeBid(room, ben.id, 7);
  dropFromAuction(room, cal.id);  // Cal's socket dropped
  assert.equal(room.pending?.type, 'auction', 'still waiting on Ana');

  dropFromAuction(room, ana.id);
  assert.equal(room.pending, null, 'settled once nobody can outbid');
  assert.equal(room.ownership[3]?.ownerId, ben.id);
});

test('an auction opens with a ten second window', () => {
  const { auction } = openRioAuction();
  const remaining = auction.endsAt - Date.now();
  assert.ok(
    remaining > AUCTION_WINDOW_MS - 1000 && remaining <= AUCTION_WINDOW_MS,
    `window was ${remaining}ms`,
  );
});

test('every bid restarts the ten second clock', () => {
  const { room, players } = openRioAuction();
  const [, ben, cal] = players;

  const auction = room.pending as PendingAuction;
  auction.endsAt = Date.now() + 500; // about to expire

  placeBid(room, ben.id, 5);
  const afterFirst = (room.pending as PendingAuction).endsAt - Date.now();
  assert.ok(afterFirst > 9000, `clock did not reset: ${afterFirst}ms`);

  (room.pending as PendingAuction).endsAt = Date.now() + 500;
  placeBid(room, cal.id, 6);
  const afterSecond = (room.pending as PendingAuction).endsAt - Date.now();
  assert.ok(afterSecond > 9000, 'an outbid restarts the clock too');
});

test('the clock keeps running while the window is open', () => {
  const { room } = openRioAuction();
  assert.equal(expireAuction(room, Date.now()), false, 'not expired yet');
  assert.equal(room.pending?.type, 'auction', 'the auction is still live');
});

test('when the clock runs out the standing bid wins', () => {
  const { room, players } = openRioAuction();
  const [, ben] = players;
  const before = getPlayer(room, ben.id)!.cash;

  placeBid(room, ben.id, 18);
  const deadline = (room.pending as PendingAuction).endsAt;

  assert.equal(expireAuction(room, deadline + 1), true);
  assert.equal(room.pending, null);
  assert.equal(room.ownership[3]?.ownerId, ben.id, 'the highest bidder wins');
  assert.equal(getPlayer(room, ben.id)!.cash, before - 18);
});

test('an auction nobody bids on expires and the property stays unowned', () => {
  const { room, players } = openRioAuction();
  const [ana] = players;
  const deadline = (room.pending as PendingAuction).endsAt;

  assert.equal(expireAuction(room, deadline + 1), true);
  assert.equal(room.pending, null);
  assert.equal(room.ownership[3], undefined);
  assert.notEqual(currentPlayerId(room), ana.id, 'the turn moves on');
});

test('passing does not shorten or extend the window', () => {
  const { room, players } = openRioAuction();
  const [, ben, cal] = players;

  placeBid(room, ben.id, 4);
  const deadline = (room.pending as PendingAuction).endsAt;
  passAuction(room, cal.id);
  assert.equal((room.pending as PendingAuction).endsAt, deadline, 'a pass leaves the clock alone');
});

test('the snapshot reports the time left rather than a wall-clock deadline', () => {
  const { room } = openRioAuction();
  const pending = serialize(room).pending as PendingAuction;
  assert.equal(pending.type, 'auction');
  assert.ok(typeof pending.endsIn === 'number', 'clients get a duration');
  assert.ok(pending.endsIn! > 0 && pending.endsIn! <= AUCTION_WINDOW_MS);
});

test('a player who cannot afford a property sends it straight to auction', () => {
  const { room, players } = makeRoom();
  const [ana] = players;
  startDeterministic(room, ana.id);
  getPlayer(room, ana.id)!.cash = 5; // Rio costs $60

  withDice([1, 2], () => rollDice(room, ana.id));
  assert.equal(room.pending?.type, 'auction', 'no first refusal you cannot afford');
});

test('a solo bidder still has to bid rather than winning by default', () => {
  const { room, players } = makeRoom();
  const [ana, ben] = players;
  startDeterministic(room, ana.id);
  getPlayer(room, ben.id)!.connected = false; // only Ana is at the table

  withDice([1, 2], () => rollDice(room, ana.id));
  skipProperty(room, ana.id);
  assert.equal(room.pending?.type, 'auction');
  assert.deepEqual((room.pending as PendingAuction).participants, [ana.id]);

  assert.equal(placeBid(room, ana.id, 1).error, undefined);
  assert.equal(room.pending, null, 'settles once the only bidder has bid');
  assert.equal(room.ownership[3]?.ownerId, ana.id);
});

test('with auctions off a skip simply leaves the property unowned', () => {
  const { room, players } = makeRoom();
  const [ana] = players;
  updateSettings(room, ana.id, { auction: false, randomizeOrder: false });
  startGame(room, ana.id);

  withDice([1, 2], () => rollDice(room, ana.id));
  skipProperty(room, ana.id);
  assert.equal(room.pending, null);
  assert.equal(room.ownership[3], undefined);
});

test('bankruptcy releases every property and ends the game with one player left', () => {
  const { room, players } = makeRoom();
  const [ana, ben] = players;
  startDeterministic(room, ana.id);
  room.ownership[3] = { ownerId: ana.id, houses: 0, mortgaged: false };
  room.ownership[5] = { ownerId: ana.id, houses: 0, mortgaged: false };

  declareBankrupt(room, ana.id);
  assert.equal(getPlayer(room, ana.id)?.alive, false);
  assert.equal(room.ownership[3], undefined);
  assert.equal(room.ownership[5], undefined);
  assert.equal(room.phase, 'ended');
  assert.equal(room.winner, ben.id);
});

test('a player who cannot pay rent goes bankrupt', () => {
  const { room, players } = makeRoom(['Ana', 'Ben', 'Cal']);
  const [ana, ben] = players;
  startDeterministic(room, ana.id);
  room.ownership[3] = { ownerId: ben.id, houses: 0, mortgaged: false };
  getPlayer(room, ana.id)!.cash = 1; // rent is 6

  withDice([1, 2], () => rollDice(room, ana.id));
  assert.equal(getPlayer(room, ana.id)?.alive, false);
  assert.equal(room.phase, 'playing', 'two players remain, so the game continues');
});

test('removing a player mid-game drops them from the turn order', () => {
  const { room, players } = makeRoom(['Ana', 'Ben', 'Cal']);
  const [ana, ben] = players;
  startDeterministic(room, ana.id);

  removePlayer(room, ben.id);
  assert.ok(!room.order.includes(ben.id));
  assert.equal(room.players.length, 2);
  assert.ok(currentPlayerId(room) !== ben.id);
  assert.equal(room.hostId, ana.id);
});

test('the host role transfers when the host leaves', () => {
  const { room, players } = makeRoom();
  removePlayer(room, players[0].id);
  assert.equal(room.hostId, players[1].id);
});

test('chat rejects empty messages and trims long ones', () => {
  const { room, players } = makeRoom();
  assert.equal(sendChat(room, players[0].id, '   ').error, 'Empty message');

  sendChat(room, players[0].id, 'x'.repeat(500));
  const last = room.chat[room.chat.length - 1];
  assert.equal(last.text.length, 200);
  assert.equal(last.playerId, players[0].id);
  assert.equal(last.name, players[0].name);
  assert.equal(last.color, players[0].color);
});

test('chat has its own history and does not land in the game log', () => {
  const { room, players } = makeRoom();
  const logBefore = room.log.length;
  sendChat(room, players[0].id, 'hello');
  assert.equal(room.log.length, logBefore);
  assert.equal(room.chat.length, 1);
  assert.equal(room.chat[0].text, 'hello');
});

/* ---------------------------------------------------------------- */
/* serialisation                                                     */
/* ---------------------------------------------------------------- */

test('the snapshot carries the state clients render and hides engine internals', () => {
  const { room, players } = makeRoom();
  startDeterministic(room, players[0].id);
  withDice([1, 2], () => rollDice(room, players[0].id));
  skipProperty(room, players[0].id);

  const snapshot = serialize(room);
  assert.equal(snapshot.id, 'testid');
  assert.equal(snapshot.phase, 'playing');
  assert.equal(snapshot.players.length, 2);
  assert.ok(snapshot.currentPlayerId);
  assert.deepEqual(snapshot.settings, room.settings);

  // the auction queue is engine bookkeeping and must not leak to clients
  if (snapshot.pending) {
    assert.ok(!('queue' in snapshot.pending));
    assert.ok(!('skipperId' in snapshot.pending));
  }
  assert.deepEqual(snapshot.chat, room.chat);
  assert.ok(JSON.stringify(snapshot).length > 0, 'snapshot is JSON-serialisable');
});

test('the log stays bounded so a long game cannot grow without limit', () => {
  const { room } = makeRoom();
  for (let i = 0; i < 80; i++) {
    const { player } = addPlayer(room, { name: `Temp${i}` });
    assert.ok(player);
    removePlayer(room, player.id);
  }
  assert.ok(room.log.length <= 60, `log grew to ${room.log.length}`);
});

test('chat stays bounded separately from the game log', () => {
  const { room, players } = makeRoom();
  for (let i = 0; i < 120; i++) sendChat(room, players[0].id, `msg ${i}`);
  assert.equal(room.chat.length, MAX_CHAT);
  assert.equal(room.chat[0].text, `msg ${120 - MAX_CHAT}`);
  assert.equal(room.chat[room.chat.length - 1].text, 'msg 119');
});
