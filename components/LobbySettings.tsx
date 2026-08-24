'use client';

import {
  Users, Lock, Map, Banknote, Palmtree, Gavel, Landmark,
  Hammer, Coins, Shuffle, ChevronRight, BadgeDollarSign, Percent, type LucideIcon,
} from 'lucide-react';
import {
  STARTING_CASH_OPTIONS, MAX_PLAYER_OPTIONS,
  SELL_RATE_OPTIONS, MORTGAGE_RATE_OPTIONS, MORTGAGE_INTEREST_OPTIONS,
} from '@/lib/rules';
import Combobox from './Combobox';
import type { GameActions } from '@/hooks/useGameSocket';
import type { GameSettings } from '@/types/game';

interface Props {
  settings: GameSettings;
  isHost: boolean;
  locked: boolean;
  actions: GameActions;
}

interface ToggleRowProps {
  icon: LucideIcon;
  title: string;
  description: string;
  value: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}

function ToggleRow({ icon: Icon, title, description, value, disabled, onChange }: ToggleRowProps) {
  return (
    <div className={`settings-row${value ? ' active' : ''}`}>
      <div className="settings-icon"><Icon size={15} /></div>
      <div className="settings-text">
        <div className="t">{title}</div>
        <div className="d">{description}</div>
      </div>
      <div className="settings-control">
        <button
          className={`switch${value ? ' on' : ''}`}
          disabled={disabled}
          aria-pressed={value}
          aria-label={title}
          onClick={() => onChange(!value)}
        />
      </div>
    </div>
  );
}

interface ChoiceRowProps {
  icon: LucideIcon;
  title: string;
  description: string;
  value: number;
  options: readonly number[];
  format: (value: number) => string;
  disabled: boolean;
  onChange: (next: number) => void;
}

function ChoiceRow({
  icon: Icon, title, description, value, options, format, disabled, onChange,
}: ChoiceRowProps) {
  return (
    <div className="settings-row">
      <div className="settings-icon"><Icon size={15} /></div>
      <div className="settings-text">
        <div className="t">{title}</div>
        <div className="d">{description}</div>
      </div>
      <div className="settings-control">
        <Combobox
          value={String(value)}
          disabled={disabled}
          options={options.map((option) => ({ value: String(option), label: format(option) }))}
          onChange={(v) => onChange(Number(v))}
        />
      </div>
    </div>
  );
}

export default function LobbySettings({ settings, isHost, locked, actions }: Props) {
  const disabled = !isHost || locked;
  const set = (patch: Partial<GameSettings>) => actions.updateSettings(patch);

  return (
    <>
      <div className="section-title">Game settings</div>

      <div className="settings-row">
        <div className="settings-icon"><Users size={15} /></div>
        <div className="settings-text">
          <div className="t">Maximum players</div>
          <div className="d">How many players can join the game</div>
        </div>
        <div className="settings-control">
          <Combobox
            value={String(settings.maxPlayers)}
            disabled={disabled}
            options={MAX_PLAYER_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
            onChange={(v) => set({ maxPlayers: Number(v) })}
          />
        </div>
      </div>

      <ToggleRow
        icon={Lock}
        title="Private room"
        description="Private rooms can be accessed using the room URL only"
        value={settings.isPrivate}
        disabled={disabled}
        onChange={(v) => set({ isPrivate: v })}
      />

      <div className="settings-row">
        <div className="settings-icon"><Map size={15} /></div>
        <div className="settings-text">
          <div className="t">Board map</div>
          <div className="d">Change map tiles, properties and stacks</div>
        </div>
        <div className="settings-control map-control">
          <span className="map-name">{settings.map}</span>
          <span className="map-browse">Browse maps <ChevronRight size={11} /></span>
        </div>
      </div>

      <div className="section-title">Gameplay rules</div>

      <ToggleRow
        icon={Banknote}
        title="x2 rent on full-set properties"
        description="If a player owns a full property set, the base rent payment will be doubled"
        value={settings.x2Rent}
        disabled={disabled}
        onChange={(v) => set({ x2Rent: v })}
      />
      <ToggleRow
        icon={Palmtree}
        title="Vacation cash"
        description="If a player lands on Vacation, all collected money from taxes and bank payments will be earned"
        value={settings.vacationCash}
        disabled={disabled}
        onChange={(v) => set({ vacationCash: v })}
      />
      <ToggleRow
        icon={Gavel}
        title="Auction"
        description="If someone skips purchasing the property landed on, it will be sold to the highest bidder"
        value={settings.auction}
        disabled={disabled}
        onChange={(v) => set({ auction: v })}
      />
      <ToggleRow
        icon={Lock}
        title="Don't collect rent while in prison"
        description="Rent will not be collected when landing on properties whose owners are in prison"
        value={settings.noRentInPrison}
        disabled={disabled}
        onChange={(v) => set({ noRentInPrison: v })}
      />
      <ToggleRow
        icon={Landmark}
        title="Mortgage"
        description={`Mortgage properties to raise ${settings.mortgageRate}% of their cost, but you won't get paid rent when players land on them`}
        value={settings.mortgage}
        disabled={disabled}
        onChange={(v) => set({ mortgage: v })}
      />
      <ToggleRow
        icon={Hammer}
        title="Even build"
        description="Houses and hotels must be built up and sold off evenly within a property set"
        value={settings.evenBuild}
        disabled={disabled}
        onChange={(v) => set({ evenBuild: v })}
      />

      <div className="settings-row">
        <div className="settings-icon"><Coins size={15} /></div>
        <div className="settings-text">
          <div className="t">Starting cash</div>
          <div className="d">Adjust how much money players start the game with</div>
        </div>
        <div className="settings-control">
          <Combobox
            value={String(settings.startingCash)}
            disabled={disabled}
            options={STARTING_CASH_OPTIONS.map((n) => ({ value: String(n), label: `$${n}` }))}
            onChange={(v) => set({ startingCash: Number(v) })}
          />
        </div>
      </div>

      <ChoiceRow
        icon={BadgeDollarSign}
        title="Sell back rate"
        description="What the bank pays for a property or building you sell"
        value={settings.sellRate}
        options={SELL_RATE_OPTIONS}
        format={(v) => `${v}%`}
        disabled={disabled}
        onChange={(v) => set({ sellRate: v })}
      />
      <ChoiceRow
        icon={Landmark}
        title="Mortgage rate"
        description="How much of a property's price mortgaging raises"
        value={settings.mortgageRate}
        options={MORTGAGE_RATE_OPTIONS}
        format={(v) => `${v}%`}
        disabled={disabled}
        onChange={(v) => set({ mortgageRate: v })}
      />
      <ChoiceRow
        icon={Percent}
        title="Mortgage interest"
        description="Added to the loan when you pay a mortgage off"
        value={settings.mortgageInterest}
        options={MORTGAGE_INTEREST_OPTIONS}
        format={(v) => `${v}%`}
        disabled={disabled}
        onChange={(v) => set({ mortgageInterest: v })}
      />

      <ToggleRow
        icon={Shuffle}
        title="Randomize player order"
        description="Randomly reorder players at the beginning of the game"
        value={settings.randomizeOrder}
        disabled={disabled}
        onChange={(v) => set({ randomizeOrder: v })}
      />
    </>
  );
}
