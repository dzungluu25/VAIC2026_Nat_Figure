import React from 'react';

type ToastProps = {
  title: string;
  description?: string;
  variant?: 'default' | 'success' | 'warning' | 'error';
  onClose?: () => void;
};

export const Toast = ({ title, description, variant = 'default', onClose }: ToastProps) => {
  const variants = {
    default: 'bg-n100 border-n300',
    success: 'bg-green-50 border-green-200',
    warning: 'bg-orange-50 border-orange-200',
    error: 'bg-red-50 border-red-200',
  };

  const textVariants = {
    default: 'text-n900',
    success: 'text-success',
    warning: 'text-warning',
    error: 'text-error',
  };

  return (
    <div className={`pointer-events-auto flex w-full max-w-md flex-col gap-1 rounded-sm border p-4 shadow-md transition-all ${variants[variant]}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h3 className={`text-sm font-semibold ${textVariants[variant]}`}>{title}</h3>
          {description && <p className="text-sm text-n700">{description}</p>}
        </div>
        {onClose && (
          <button 
            onClick={onClose}
            className="text-n500 hover:text-n900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-n500 rounded-sm px-2 py-1 text-xs"
          >
            Đóng
          </button>
        )}
      </div>
    </div>
  );
};
