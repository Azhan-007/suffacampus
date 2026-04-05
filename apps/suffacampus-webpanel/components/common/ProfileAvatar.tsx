'use client';
import Image from 'next/image';
import { getAvatarColor, getInitials } from '@/lib/designTokens';

interface ProfileAvatarProps {
  src?: string | null;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  shape?: 'circle' | 'rounded';
  className?: string;
  showBorder?: boolean;
}

const SIZE_MAP = {
  xs: { container: 'w-6 h-6', text: 'text-[9px]', imgClass: 'w-6 h-6' },
  sm: { container: 'w-8 h-8', text: 'text-xs', imgClass: 'w-8 h-8' },
  md: { container: 'w-10 h-10', text: 'text-sm', imgClass: 'w-10 h-10' },
  lg: { container: 'w-14 h-14', text: 'text-lg', imgClass: 'w-14 h-14' },
  xl: { container: 'w-16 h-16', text: 'text-xl', imgClass: 'w-16 h-16' },
  '2xl': { container: 'w-20 h-20', text: 'text-2xl', imgClass: 'w-20 h-20' },
};

export default function ProfileAvatar({
  src,
  name,
  size = 'md',
  shape = 'rounded',
  className = '',
  showBorder = false,
}: ProfileAvatarProps) {
  const s = SIZE_MAP[size];
  const roundClass = shape === 'circle' ? 'rounded-full' : 'rounded-xl';
  const borderClass = showBorder ? 'ring-2 ring-white shadow-sm' : '';

  if (src) {
    return (
      <Image
        src={src}
        alt={name}
        width={80}
        height={80}
        className={`${s.imgClass} ${roundClass} object-cover shrink-0 ${borderClass} ${className}`}
        unoptimized
      />
    );
  }

  const colorGradient = getAvatarColor(name);
  const initials = getInitials(name);

  return (
    <div
      className={`${s.container} ${roundClass} bg-blue-600 flex items-center justify-center shrink-0 ${borderClass} ${className}`}
    >
      <span className={`${s.text} font-semibold text-white leading-none`}>
        {initials}
      </span>
    </div>
  );
}
