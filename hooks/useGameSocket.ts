'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  C2S, S2C, type SandboxCommand, type ServerMessage, type TradeInput, type TradeResponse,
} from '@/lib/protocol';
import { PLAYER_COLORS } from '@/lib/rules';
import type { GameSettings, Player, RoomState } from '@/types/game';

const RECONNECT_DELAY = 1200;

type ConnStatus = 'connecting' | 'open' | 'closed';

export interface GameActions {
  join: (name: string, color: string) => void;
  setAppearance: (color: string) => void;
  updateSettings: (settings: Partial<GameSettings>) => void;
  start: () => void;
  rematch: () => void;
  roll: () => void;
  buy: () => void;
  skip: () => void;
  bid: (amount: number) => void;
  pass: () => void;
  endTurn: () => void;
  build: (tileIndex: number) => void;
  sellHouse: (tileIndex: number) => void;
  sellProperty: (tileIndex: number) => void;
  mortgage: (tileIndex: number) => void;
  unmortgage: (tileIndex: number) => void;
  bankrupt: () => void;
  proposeTrade: (input: TradeInput) => void;
  respondTrade: (tradeId: string, action: TradeResponse) => void;
  setTradeDrafting: (drafting: boolean) => void;
  chat: (text: string) => void;
  leave: () => void;
  dismissError: () => void;
  sandbox: (cmd: SandboxCommand) => void;
}

const storageKey = (roomId: string) => `monopoli:${roomId}`;

/**
 * Owns the single WebSocket for a room. Server state is authoritative —
 * this hook never mutates a snapshot locally.
 */
export function useGameSocket(roomId: string, opts?: { lab?: boolean }) {
  const [state, setState] = useState<RoomState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnStatus>('connecting');
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pendingJoinRef = useRef<{ name: string; color: string } | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedByUsRef = useRef(false);

  const rawSend = useCallback((payload: Record<string, unknown>): boolean => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(payload));
    return true;
  }, []);

  const lab = Boolean(opts?.lab);

  useEffect(() => {
    if (!roomId) return undefined;
    closedByUsRef.current = false;

    const connect = () => {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
      wsRef.current = ws;
      setStatus('connecting');

      ws.onopen = () => {
        setStatus('open');
        setError(null);

        // Subscribe first so the room renders before we take a seat.
        ws.send(JSON.stringify({ type: C2S.WATCH, roomId, sandbox: lab }));

        // A stored id means we already hold a seat here — try to reclaim it.
        const savedId = window.sessionStorage.getItem(storageKey(roomId));
        if (savedId) {
          ws.send(JSON.stringify({ type: C2S.REJOIN, roomId, playerId: savedId }));
        } else if (pendingJoinRef.current) {
          ws.send(JSON.stringify({ type: C2S.JOIN, roomId, ...pendingJoinRef.current }));
          pendingJoinRef.current = null;
        } else if (lab) {
          const name = window.sessionStorage.getItem('monopoli:nickname')?.trim() || 'Lab';
          ws.send(JSON.stringify({
            type: C2S.JOIN, roomId, name: name.slice(0, 16), color: PLAYER_COLORS[0],
          }));
        }
      };

      ws.onmessage = (event: MessageEvent<string>) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(event.data) as ServerMessage;
        } catch {
          return;
        }

        if (msg.type === S2C.JOINED) {
          window.sessionStorage.setItem(storageKey(roomId), msg.playerId);
          setPlayerId(msg.playerId);
          setError(null);
        } else if (msg.type === S2C.STATE) {
          setState(msg.state);
        } else if (msg.type === S2C.ERROR) {
          // A failed rejoin means the seat is gone: drop it and join fresh.
          if (/no longer/i.test(msg.message)) {
            window.sessionStorage.removeItem(storageKey(roomId));
            setPlayerId(null);
            if (pendingJoinRef.current) {
              ws.send(JSON.stringify({ type: C2S.JOIN, roomId, ...pendingJoinRef.current }));
              pendingJoinRef.current = null;
              return;
            }
            if (lab) {
              const name = window.sessionStorage.getItem('monopoli:nickname')?.trim() || 'Lab';
              ws.send(JSON.stringify({
                type: C2S.JOIN, roomId, name: name.slice(0, 16), color: PLAYER_COLORS[0],
              }));
              return;
            }
          }
          setError(msg.message);
        }
      };

      ws.onclose = () => {
        setStatus('closed');
        if (closedByUsRef.current) return;
        retryRef.current = setTimeout(connect, RECONNECT_DELAY);
      };

      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      closedByUsRef.current = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [roomId, lab]);

  const join = useCallback((name: string, color: string) => {
    if (!rawSend({ type: C2S.JOIN, roomId, name, color })) {
      pendingJoinRef.current = { name, color }; // socket still opening
    }
  }, [rawSend, roomId]);

  const actions: GameActions = {
    join,
    setAppearance: (color) => { rawSend({ type: C2S.SET_APPEARANCE, color }); },
    updateSettings: (settings) => { rawSend({ type: C2S.UPDATE_SETTINGS, settings }); },
    start: () => { rawSend({ type: C2S.START }); },
    rematch: () => { rawSend({ type: C2S.REMATCH }); },
    roll: () => { rawSend({ type: C2S.ROLL }); },
    buy: () => { rawSend({ type: C2S.BUY }); },
    skip: () => { rawSend({ type: C2S.SKIP }); },
    bid: (amount) => { rawSend({ type: C2S.BID, amount }); },
    pass: () => { rawSend({ type: C2S.PASS }); },
    endTurn: () => { rawSend({ type: C2S.END_TURN }); },
    build: (tileIndex) => { rawSend({ type: C2S.BUILD, tileIndex }); },
    sellHouse: (tileIndex) => { rawSend({ type: C2S.SELL_HOUSE, tileIndex }); },
    sellProperty: (tileIndex) => { rawSend({ type: C2S.SELL_PROPERTY, tileIndex }); },
    mortgage: (tileIndex) => { rawSend({ type: C2S.MORTGAGE, tileIndex }); },
    unmortgage: (tileIndex) => { rawSend({ type: C2S.UNMORTGAGE, tileIndex }); },
    bankrupt: () => { rawSend({ type: C2S.BANKRUPT }); },
    proposeTrade: (input) => { rawSend({ type: C2S.PROPOSE_TRADE, ...input }); },
    respondTrade: (tradeId, action) => { rawSend({ type: C2S.RESPOND_TRADE, tradeId, action }); },
    setTradeDrafting: (drafting) => { rawSend({ type: C2S.TRADE_DRAFT, drafting }); },
    chat: (text) => { rawSend({ type: C2S.CHAT, text }); },
    sandbox: (cmd) => { rawSend({ type: C2S.SANDBOX, ...cmd }); },
    leave: () => {
      window.sessionStorage.removeItem(storageKey(roomId));
      rawSend({ type: C2S.LEAVE });
    },
    dismissError: () => setError(null),
  };

  const me: Player | null = state?.players.find((p) => p.id === playerId) ?? null;

  return { state, playerId, me, status, error, actions };
}
