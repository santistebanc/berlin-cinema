import React from 'react';
import { cn } from '../../utils/cn';

type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'subtle' | 'link';
type ButtonSize = 'icon' | 'sm' | 'md';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'btn btn-primary',
  ghost: 'btn btn-ghost',
  outline: 'btn btn-outline',
  subtle: 'btn btn-subtle',
  link: 'btn btn-link',
};

const sizeClasses: Record<ButtonSize, string> = {
  icon: 'h-9 w-9 p-0',
  sm: 'px-2 py-1 text-xs',
  md: 'px-4 py-2 text-sm',
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, size = 'md', type = 'button', variant = 'primary', ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(variantClasses[variant], sizeClasses[size], className)}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';

export default Button;
