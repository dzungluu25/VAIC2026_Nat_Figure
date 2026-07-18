import React from 'react';

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: 'default' | 'success' | 'warning' | 'error';
};

export const Badge = ({ className = '', variant = 'default', children, ...props }: BadgeProps) => {
  const variants = {
    default: 'bg-n300 text-n700 border border-n300',
    success: 'bg-green-100 text-success border border-green-200',
    warning: 'bg-orange-100 text-warning border border-orange-200',
    error: 'bg-red-100 text-error border border-red-200',
  };

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-sm text-xs font-semibold ${variants[variant]} ${className}`} {...props}>
      {children}
    </span>
  );
};
