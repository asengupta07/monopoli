import BR from 'country-flag-icons/react/1x1/BR';
import IL from 'country-flag-icons/react/1x1/IL';
import IT from 'country-flag-icons/react/1x1/IT';
import DE from 'country-flag-icons/react/1x1/DE';
import FR from 'country-flag-icons/react/1x1/FR';
import CN from 'country-flag-icons/react/1x1/CN';
import GB from 'country-flag-icons/react/1x1/GB';
import US from 'country-flag-icons/react/1x1/US';

import type { GroupKey } from '@/types/game';

/**
 * Real flag artwork from `country-flag-icons`, imported per country rather than
 * from the barrel so only these eight SVGs reach the bundle.
 *
 * The 1x1 set is square, which crops cleanly to the circular badge the board
 * uses — the 3x2 set would need the sides cut off.
 */
const FLAGS: Record<GroupKey, typeof BR> = {
  brazil: BR,
  israel: IL,
  italy: IT,
  germany: DE,
  france: FR,
  china: CN,
  uk: GB,
  usa: US,
};

const NAMES: Record<GroupKey, string> = {
  brazil: 'Brazil',
  israel: 'Israel',
  italy: 'Italy',
  germany: 'Germany',
  france: 'France',
  china: 'China',
  uk: 'United Kingdom',
  usa: 'United States',
};

export default function Flag({ group }: { group: GroupKey }) {
  const Artwork = FLAGS[group];
  return (
    <span className="flag" role="img" aria-label={NAMES[group]}>
      <Artwork />
    </span>
  );
}
