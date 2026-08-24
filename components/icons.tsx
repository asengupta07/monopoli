import {
  Plane, Zap, Droplets, Receipt, Gem, Gift, HelpCircle, Palmtree, Skull,
  Lock, Users, Map, Banknote, Gavel, Landmark, Hammer, Coins, Shuffle,
  Crown, Flag as FlagIcon, MessageSquare, Volume2, Sparkles, ShoppingCart,
  LogIn, KeyRound, ChevronRight, Dices, Trophy, Check, Info, Plus, X,
  WifiOff, ArrowRight, CircleDollarSign, Play, PanelLeftClose, Search,
  House, Hotel,
  type LucideIcon,
} from 'lucide-react';

export type { LucideIcon };

export {
  Plane, Zap, Droplets, Receipt, Gem, Gift, HelpCircle, Palmtree, Skull,
  Lock, Users, Map, Banknote, Gavel, Landmark, Hammer, Coins, Shuffle,
  Crown, FlagIcon, MessageSquare, Volume2, Sparkles, ShoppingCart,
  LogIn, KeyRound, ChevronRight, Dices, Trophy, Check, Info, Plus, X,
  WifiOff, ArrowRight, CircleDollarSign, Play, PanelLeftClose, Search,
  House, Hotel,
};

/**
 * Board icons scale with the board's container query, so they are sized by the
 * wrapper rather than a pixel `size` prop.
 */
export function TileIcon({ icon: Icon, className = 'tile-icon' }: { icon: LucideIcon; className?: string }) {
  return (
    <span className={className} aria-hidden="true">
      <Icon strokeWidth={2.25} />
    </span>
  );
}
