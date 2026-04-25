import React from 'react';
import Button from '../ui/Button';

interface DetailPageStateProps {
  actionLabel?: string;
  children?: React.ReactNode;
  message?: string;
  onAction?: () => void;
  title?: string;
}

const DetailPageState: React.FC<DetailPageStateProps> = ({
  actionLabel,
  children,
  message,
  onAction,
  title,
}) => {
  return (
    <div className="py-12 text-center">
      {title && <h2 className="page-title mx-auto mb-4 max-w-[20ch]">{title}</h2>}
      {message && <p className="body-muted mx-auto mb-6 max-w-[42ch]">{message}</p>}
      {children}
      {onAction && actionLabel && (
        <Button
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
};

export default DetailPageState;
