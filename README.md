# MonoPoli

A multiplayer property-trading board game — Next.js 16 (App Router, TypeScript)
with an authoritative WebSocket game server and MongoDB persistence.

Black and gold, real flag artwork, open auctions on a ten second clock, and
houses that actually change the rent.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

Open the printed URL, pick an appearance, and share `/room/<code>` with anyone
else on the network. Rooms are created on demand, so any code works as a link.

For production:

```bash
npm run build
npm start            # NODE_ENV=production, same custom server
```

`PORT` and `HOST` are respected (`HOST` defaults to `0.0.0.0`, so LAN players can
reach you).

## Environment

`.env.local` (gitignored):

```
MONGODB_URI="mongodb+srv://..."
MONGODB_DB="monopoli"
```

Mongo is optional. Without `MONGODB_URI` the game runs entirely in memory —
everything works, but games are lost on restart.

## Architecture

```
server.ts            custom Node server: Next request handler + ws upgrade routing
lib/board.ts         the 40 tiles and their grid placement (shared client/server)
lib/gameEngine.ts    all game rules — the only place state is mutated
lib/roomStore.ts     in-memory room cache backed by MongoDB
lib/mongo.ts         cached Mongo client + TTL index
lib/protocol.ts      the message names and payload types both sides share
hooks/useGameSocket  the client's single socket: connect, reconnect, dispatch
components/          the UI, driven entirely by server snapshots
```

**The server is authoritative.** Clients never compute game state — they send
intents (`roll`, `buy`, `skip`) and render whatever snapshot comes back. Every
rule check (whose turn it is, whether you can afford a property, who owns what)
happens in `gameEngine.ts`, so a modified client cannot cheat.

**Rooms live in memory, MongoDB is the durable store.** A Mongo round-trip per
dice roll would be pointless latency, so the working copy is a `Map` and writes
are debounced (400ms) behind it. A room missing from memory is rehydrated from
Mongo on first access, which is what makes a restart mid-game survivable. On
`SIGINT`/`SIGTERM` every pending write is flushed before exit.

**WebSocket upgrades are routed by hand.** Attaching `ws` directly to the HTTP
server swallows every upgrade including Next's own HMR socket, so `server.ts`
uses `noServer: true` and forwards `/ws` to the game server and everything else
to `app.getUpgradeHandler()`.

**Pieces walk the board.** Tokens are an overlay above the tiles
(`components/TokenLayer.tsx`), because a piece has to travel *through* the
squares between its old and new position — as a child of one tile it could only
teleport. `lib/path.ts` turns a move into the list of squares to visit, and the
piece steps through them one at a time.

**Tile centres are computed, never measured.** `lib/geometry.ts` derives every
centre as a percentage of the board from the grid definition. An earlier version
measured the DOM with a `ResizeObserver`, which made the pieces depend on layout
timing — and when the first measurement came back zero, the tokens rendered
nothing at all. Arithmetic has no such failure mode: the pieces are correct on
the first paint. Because the constants now live in two places, a test parses
`globals.css` and fails if the grid and the geometry drift apart.

Walking each square is also what keeps movement orthogonal: tile centres along
an edge are colinear and a corner sits at the intersection of two edges, so
"two right, three down" traces an L instead of cutting the diagonal. A test
asserts this directly — every consecutive pair of squares must differ by exactly
one cell on exactly one axis. Moves no pair of dice could produce (cards, going
to prison) are treated as jumps and place the piece instead of marching it.

**No emoji anywhere in the UI.** Every glyph is a `lucide-react` icon, and tiles
carry a semantic `IconKey` (`'plane'`, `'zap'`, …) that components map to a
component — the board data never holds presentation. Flags come from
`country-flag-icons`, imported per country so only the eight used reach the
bundle; emoji flags were dropped because they render differently on every OS and
not at all on Windows.

**Black and gold.** One accent colour drives the whole interface through
`--gold` and the `--accent` gradient, with `--on-gold` for text that sits on it —
gold needs dark ink, not white. Only the property group colours stay as they
were, because those identify the sets on the board.

**Two typefaces.** Barlow Semi Condensed carries every label: tiles are narrow
and names like "Power Company" have to fit inside one. Space Grotesk handles
display type — wordmark, card titles, money — where there is room for it.

**The board scales by container query.** Tiles, type, flags, icons and dice are
all sized in `cqw` against the board element, so the whole thing scales as one
piece at any viewport without a single media query.

### Connection lifecycle

1. Client opens the socket and sends `watch` — it can see the room and the taken
   appearances before committing to a seat.
2. `join` claims a seat and returns a `playerId`, cached in `sessionStorage`.
3. On reconnect the client sends `rejoin` with that id. Mid-game the seat is held
   open (the player just shows as `offline`); in the lobby the seat is freed
   immediately so nobody blocks a slot by closing a tab.
4. A 30s ping/pong sweep terminates sockets that stopped answering.

## Tests

```bash
npm test      # engine + board rules (node:test, no browser)
npm run check # typecheck + lint + tests
```

The suite covers the rules directly against `gameEngine.ts`: turn order, movement,
rent for all three property kinds, prison, mortgages, auctions, bankruptcy,
settings validation, and the snapshot shape. Dice are stubbed so movement tests
are deterministic. It includes regressions for the grid off-by-one that shifted
the right-hand column and for the auction bookkeeping leaking into snapshots.

### Auctions

When a property is declined — or the player who landed on it cannot afford the
asking price — it goes to an open auction rather than being offered around at a
fixed price.

Every seated player bids, including whoever declined it. Bidding opens at **$1**
(the first bid must beat a standing bid of zero) and any amount up to the
bidder's cash is allowed, so the winner pays what they bid, not the list price.
Passing drops you out for good, and the current leader may not pass — a standing
bid is a commitment. The auction settles when only the leader is left, or when
everyone passes without a bid, in which case the property stays unowned. A
disconnect counts as a pass so one dropped socket cannot stall the table.

There is also a **ten second clock**, restarted by every bid: when it runs out
the standing bid wins, and an auction nobody bids on simply expires. The engine
stays free of timers — it exposes `expireAuction(room, now)` and the server owns
the scheduling, rescheduling from `broadcast()` since every state change passes
through there. Snapshots carry the time *remaining* rather than a wall-clock
deadline, so a client whose clock disagrees with the server still counts down
correctly.

### Property cards

Clicking any ownable tile opens its card: the full rent ladder, price, house
cost and current owner, with the current build level highlighted. The ladders
come from the same tables in `lib/rules.ts` that `calcRent` uses, and tests
assert the displayed figure equals what the engine actually charges — a card can
never advertise a rent nobody would pay.

If you own the property the card is also where you manage it: buy a house or
hotel, sell one back, mortgage, pay a mortgage off, or sell the property to the
bank. Each button is disabled with the reason in its tooltip when the rule
forbids it, and the server re-checks every one of them.

### Building

Four houses, then a hotel. Building needs the complete set with nothing in it
mortgaged. House prices scale with where the set sits on the board — $50 on the
opening streets up to $200 on the last two — and rent climbs steeply with the
third house, so that is the one worth racing for.

**Even build** (on by default) stops one property running more than one level
ahead of its set, and applies in reverse when selling. A developed property
cannot be mortgaged or sold until its buildings go, and a mortgaged one cannot
be sold until the loan is settled — otherwise the bank would buy back something
it is still owed for.

Three rates are set by the host before the game and are read from the settings
everywhere, never hardcoded: **sell back rate** (what the bank pays for a
property or building), **mortgage rate** (what mortgaging raises) and **mortgage
interest** (added when paying one off).

## Implemented rules

Turn order (randomised or join order), configurable starting cash, movement,
START bonus, rent (cities, airports by count owned, utilities by dice), the x2
full-set rule, taxes, treasure and surprise cards, prison (doubles to escape,
three strikes, $50 release), three-doubles jail, property purchase, a pass-around
open auctions, mortgaging at 50% with 10% interest to lift (and
no rent while mortgaged), the vacation cash pot, bankruptcy, and win detection.

**Not implemented:** trading between players. The Trades panel says so rather
than pretending.

## Reference

`reference/index.html` is the original single-file prototype this was built from,
before the rebrand. It has no networking and is kept only for reference.
