import React from 'react';
import Badge from './ui/Badge';

interface Props {
  variant: string;
}

const VariantBadge: React.FC<Props> = ({ variant }) => (
  <Badge tone="accent" className="shrink-0 px-1">
    {variant}
  </Badge>
);

export default VariantBadge;
