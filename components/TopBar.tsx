import { Volume2 } from './icons';

export default function TopBar() {
  return (
    <div className="top-bar">
      <button className="icon-btn" aria-label="Toggle sound"><Volume2 size={16} /></button>
    </div>
  );
}
