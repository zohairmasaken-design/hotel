import React from 'react';

type Props = {
  className?: string;
  onDark?: boolean;
  alt?: string;
};

export default function Logo({ className, onDark = false, alt = 'Logo' }: Props) {
  const style = onDark ? undefined : { filter: 'brightness(0) saturate(100%)' as any };
  const cls = [className, onDark ? '' : 'logo-auto'].filter(Boolean).join(' ');
  return <img src="/logo.png" alt={alt} className={cls} style={style} />;
}
