'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dices, Trophy, WifiOff, Lock } from 'lucide-react';
import { useGameSocket } from '@/hooks/useGameSocket';
import Board from './Board';
import Sidebar from './Sidebar';
import AppearancePicker from './AppearancePicker';
import BottomBar from './BottomBar';
import ChatPanel from './ChatPanel';
import SandboxPanel from './SandboxPanel';
import type { RecapView } from './GameOver';

export default function Room({ roomId, lab = false }: { roomId: string; lab?: boolean }) {
  const { state, me, status, error, actions } = useGameSocket(roomId, { lab });
  const [rolling, setRolling] = useState(false);
  const [labTile, setLabTile] = useState(9);
  const [recap, setRecap] = useState<RecapView>('over');
  const [hoverPlayerId, setHoverPlayerId] = useState<string | null>(null);

  // Keep the dice tumbling briefly so a roll reads as an action, not a jump.
  useEffect(() => {
    if (!rolling) return undefined;
    const timer = setTimeout(() => setRolling(false), 600);
    return () => clearTimeout(timer);
  }, [rolling, state?.dice]);

  // Reset the recap view whenever a game freshly ends (including a rematch
  // that ends again). This is a render-time state adjustment, not an effect:
  // React's docs call this out as the correct way to sync state to a prop
  // change without an extra render pass.
  const [prevPhase, setPrevPhase] = useState(state?.phase);
  if (state?.phase !== prevPhase) {
    setPrevPhase(state?.phase);
    if (state?.phase === 'ended') setRecap('over');
  }

  const defaultName = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return window.sessionStorage.getItem('monopoli:nickname') ?? '';
  }, []);

  const gameActions = useMemo(
    () => ({ ...actions, roll: () => { setRolling(true); actions.roll(); } }),
    [actions],
  );

  if (!state) {
    return (
      <div className="screen">
        <div className="stage">
          <div className="center-msg">
            <div className="home-dice spin"><Dices strokeWidth={1.5} /></div>
            {status === 'open' ? 'Loading room...' : 'Connecting to the server...'}
          </div>
        </div>
        <BottomBar roomId={roomId} showShare />
      </div>
    );
  }

  const seated = Boolean(me);
  const current = state.players.find((p) => p.id === state.currentPlayerId) ?? null;

  const turnStatus =
    state.phase === 'lobby' ? 'Waiting for the host to start the game'
    : state.phase === 'ended'
      ? (
        <>
          <Trophy size={15} />
          <span className="who">{state.players.find((p) => p.id === state.winner)?.name}</span>
          {' '}wins the game
        </>
      )
      : <>It&apos;s <span className="who">{current?.name ?? '...'}</span>&apos;s turn</>;

  return (
    <div className="screen">
      {error && (
        <div className="toast" onClick={actions.dismissError} role="button" tabIndex={0}>
          {error} — dismiss
        </div>
      )}

      <div className="split">
        {seated ? (
          <Board
            state={state}
            me={me}
            rolling={rolling}
            actions={gameActions}
            onPickTile={state.sandbox ? setLabTile : undefined}
            pickIndex={state.sandbox ? labTile : undefined}
            recap={recap}
            onBackToBoard={() => setRecap('over')}
            hoverPlayerId={hoverPlayerId}
          />
        ) : (
          <div className="stage">
            <AppearancePicker
              takenColors={state.players.map((p) => p.color)}
              defaultName={defaultName}
              disabled={status !== 'open' || state.phase !== 'lobby'}
              onJoin={(name, color) => actions.join(name, color)}
            />
            {state.phase !== 'lobby' && (
              <div className="conn-badge"><Lock size={13} /> This game already started</div>
            )}
          </div>
        )}

        <Sidebar
          state={state}
          me={me}
          actions={gameActions}
          onViewStats={() => setRecap('stats')}
          onHoverPlayer={setHoverPlayerId}
        />
      </div>

      {status !== 'open' && (
        <div className="conn-badge"><WifiOff size={13} /> Reconnecting...</div>
      )}

      <BottomBar
        roomId={roomId}
        showShare={state.phase === 'lobby' && !state.sandbox}
        centre={state.sandbox && state.phase === 'lobby' ? 'UI lab — start whenever' : turnStatus}
      />

      {seated && (
        <ChatPanel
          chat={state.chat ?? []}
          log={state.log ?? []}
          myId={me?.id ?? null}
          onSend={actions.chat}
        />
      )}

      {seated && state.sandbox && (
        <SandboxPanel
          state={state}
          me={me}
          send={actions.sandbox}
          selectedTile={labTile}
          onSelectTile={setLabTile}
        />
      )}
    </div>
  );
}
