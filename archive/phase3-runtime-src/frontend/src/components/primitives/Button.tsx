import React from 'react';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger';
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', ...props }, ref) => {
    const baseClasses = 'inline-flex items-center justify-center font-sans text-sm font-semibold rounded-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2';
    
    const variants = {
      primary: 'bg-accent text-n100 hover:bg-accent-hover focus-visible:ring-accent',
      secondary: 'bg-n100 text-n700 border border-n300 hover:bg-n300 focus-visible:ring-n500',
      danger: 'bg-error text-n100 hover:bg-red-700 focus-visible:ring-error',
    };

    return (
      <button
        ref={ref}
        className={`${baseClasses} ${variants[variant]} ${className}`}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
