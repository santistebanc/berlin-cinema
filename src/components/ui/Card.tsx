import React from 'react';
import { cn } from '../../utils/cn';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, padded = false, ...props }, ref) => {
    return <div ref={ref} className={cn('ui-card', padded && 'p-4', className)} {...props} />;
  }
);

Card.displayName = 'Card';

export default Card;
