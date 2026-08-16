import React from 'react';
import { cn } from '../../utils/cn';

type BadgeTone = 'accent' | 'info' | 'muted' | 'neutral';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const toneClasses: Record<BadgeTone, string> = {
  accent: 'badge badge-accent',
  info: 'badge badge-info',
  muted: 'badge badge-muted',
  neutral: 'badge badge-neutral',
};

const Badge: React.FC<BadgeProps> = ({ children, className, tone = 'neutral', ...props }) => {
  return (
    <span className={cn(toneClasses[tone], className)} {...props}>
      {children}
    </span>
  );
};

export default Badge;
