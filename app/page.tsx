'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Dices, Users, KeyRound, ArrowRight, FlaskConical } from 'lucide-react';
import { makeRoomCode } from '@/lib/protocol';

export default function HomePage() {
  const router = useRouter();
  const [nickname, setNickname] = useState('');

  const enterRoom = (roomId: string) => {
    const name = nickname.trim() || `Player${Math.floor(Math.random() * 999)}`;
    window.sessionStorage.setItem('monopoli:nickname', name);
    router.push(`/room/${roomId}`);
  };

  return (
    <div className="screen">
      <div className="home">
        <div className="home-aurora" aria-hidden="true" />
        <div className="home-grid" aria-hidden="true" />

        <div className="home-dice" aria-hidden="true"><Dices strokeWidth={1.5} /></div>
        <h1 className="logo">Mono<span className="gold">Poli</span></h1>
        <p className="tagline">Rule the economy</p>

        <input
          className="nick-input"
          placeholder="Your nickname..."
          maxLength={16}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') enterRoom(makeRoomCode()); }}
        />
        <button className="btn-primary" onClick={() => enterRoom(makeRoomCode())}>
          Enter Game <ArrowRight size={18} />
        </button>

        <div className="row-btns">
          <button className="btn-secondary" onClick={() => enterRoom('lobby')}>
            <Users size={15} /> Public room
          </button>
          <button className="btn-secondary" onClick={() => enterRoom(makeRoomCode())}>
            <KeyRound size={15} /> Create a private game
          </button>
        </div>

        <button className="ghost-btn" onClick={() => router.push('/sandbox')}>
          <FlaskConical size={14} /> UI lab
        </button>
      </div>
    </div>
  );
}
