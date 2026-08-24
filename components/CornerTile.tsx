import { Palmtree, Skull, ChevronRight } from './icons';
import type { CornerTile as CornerData } from '@/types/game';

interface Props {
  index: number;
  tile: CornerData;
  col: number;
  row: number;
  dim?: boolean;
}

function CornerBody({ tile }: { tile: CornerData }) {
  if (tile.key === 'start') {
    return (
      <>
        <div className="start-logo">START</div>
        <div className="start-arrow">
          <ChevronRight strokeWidth={3} />
          <ChevronRight strokeWidth={3} />
        </div>
        <div className="csub">Collect 200 $</div>
      </>
    );
  }
  if (tile.key === 'jail') {
    return (
      <>
        <div className="csub">Passing by</div>
        <div className="bars" />
        <div className="jail-back" aria-hidden="true" />
        <div className="jail-front" aria-hidden="true" />
        <div className="clabel">In Prison</div>
      </>
    );
  }
  return (
    <>
      <div className="cicon">
        {tile.key === 'vacation' ? <Palmtree strokeWidth={2} /> : <Skull strokeWidth={2} />}
      </div>
      <div className="clabel">{tile.name}</div>
    </>
  );
}

export default function CornerTile({ index, tile, col, row, dim }: Props) {
  return (
    <div
      className={`corner corner-${tile.key}${dim ? ' dim' : ''}`}
      data-tile-index={index}
      style={{ gridColumn: col, gridRow: row }}
    >
      <CornerBody tile={tile} />
    </div>
  );
}
