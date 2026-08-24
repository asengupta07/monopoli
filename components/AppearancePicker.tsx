'use client';

import { useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { PLAYER_COLORS } from '@/lib/rules';

interface Props {
  takenColors: string[];
  defaultName: string;
  onJoin: (name: string, color: string) => void;
  disabled?: boolean;
}

export default function AppearancePicker({ takenColors, defaultName, onJoin, disabled }: Props) {
  const taken = new Set(takenColors);
  const firstFree = PLAYER_COLORS.find((c) => !taken.has(c)) ?? PLAYER_COLORS[0];
  const [color, setColor] = useState(firstFree);
  const [name, setName] = useState(defaultName);

  const chosen = taken.has(color) ? firstFree : color;

  return (
    <div className="avatar-card">
      <h3>Select your player appearance</h3>

      <div className="avatar-grid">
        {PLAYER_COLORS.map((c) => {
          const isTaken = taken.has(c);
          return (
            <button
              key={c}
              className={`avatar${c === chosen ? ' selected' : ''}${isTaken ? ' taken' : ''}`}
              style={{ '--tone': c } as React.CSSProperties}
              disabled={isTaken}
              aria-label={isTaken ? 'Appearance taken' : 'Choose appearance'}
              onClick={() => setColor(c)}
            >
              {c === chosen && <Check size={18} strokeWidth={3.5} />}
            </button>
          );
        })}
      </div>

      <input
        className="nick-input card-input"
        placeholder="Your nickname..."
        maxLength={16}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !disabled) onJoin(name, chosen); }}
      />

      <button className="join-btn" disabled={disabled} onClick={() => onJoin(name, chosen)}>
        Join game <ArrowRight size={16} />
      </button>
    </div>
  );
}
