import { cn } from '../../lib/cn';

interface AvatarProps {
  firstName?: string;
  lastName?: string;
  size?: 'sm' | 'md';
  className?: string;
}

const SIZE_CLASSES = { sm: 'h-7 w-7 text-xs', md: 'h-9 w-9 text-sm' };

// Deterministic per-person color so the same user's initials always land on
// the same background, without a real avatar image to key off of.
const PALETTE = ['bg-brand-600', 'bg-purple-600', 'bg-emerald-600', 'bg-orange-500', 'bg-pink-600'];

function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

export function Avatar({ firstName = '', lastName = '', size = 'md', className }: AvatarProps) {
  const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase() || '?';
  return (
    <span
      title={`${firstName} ${lastName}`.trim() || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white',
        SIZE_CLASSES[size],
        colorFor(firstName + lastName || 'user'),
        className,
      )}
    >
      {initials}
    </span>
  );
}
