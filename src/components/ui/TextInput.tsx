import React from 'react';
import { cn } from '../../utils/cn';

const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return <input ref={ref} className={cn('ui-input', className)} {...props} />;
  }
);

TextInput.displayName = 'TextInput';

export default TextInput;
