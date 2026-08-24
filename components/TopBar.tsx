import { Volume2, Sparkles, ShoppingCart, LogIn } from './icons';

export default function TopBar() {
  return (
    <div className="top-bar">
      <button className="icon-btn" aria-label="Toggle sound"><Volume2 size={16} /></button>
      <div className="pill whats-new"><Sparkles size={14} /> What&apos;s new</div>
      <div className="top-right">
        <button className="link-btn"><ShoppingCart size={16} /> Store</button>
        <button className="link-btn"><LogIn size={16} /> Login</button>
      </div>
    </div>
  );
}
