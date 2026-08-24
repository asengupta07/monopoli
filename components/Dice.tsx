'use client';

const PIP_LAYOUTS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function Die({ value, rolling, variant }: { value: number; rolling: boolean; variant: 'd1' | 'd2' }) {
  const on = PIP_LAYOUTS[value] ?? PIP_LAYOUTS[1];
  return (
    <div className={`die ${variant}${rolling ? ' rolling' : ''}`}>
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} className={`pip${on.includes(i) ? ' on' : ''}`} />
      ))}
    </div>
  );
}

export default function Dice({ dice, rolling }: { dice: [number, number] | null; rolling: boolean }) {
  const [a, b] = dice ?? [1, 1];
  return (
    <div className="dice-pair">
      <Die value={a} rolling={rolling} variant="d1" />
      <Die value={b} rolling={rolling} variant="d2" />
    </div>
  );
}
