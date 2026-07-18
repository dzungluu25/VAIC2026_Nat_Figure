import React from 'react';
import { Button } from '../primitives/Button';

export const EmptyState = ({ title, description, actionLabel, onAction }: { title: string; description: string; actionLabel?: string; onAction?: () => void }) => {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-n300 rounded-sm bg-n100">
      <h3 className="text-lg font-semibold text-n900 mb-2">{title}</h3>
      <p className="text-sm text-n500 mb-6 max-w-md">{description}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction} variant="secondary">{actionLabel}</Button>
      )}
    </div>
  );
};

export const ErrorState = ({ title = "Đã xảy ra lỗi", description, onRetry }: { title?: string; description: string; onRetry?: () => void }) => {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center border border-n300 rounded-sm bg-red-50">
      <h3 className="text-lg font-semibold text-error mb-2">{title}</h3>
      <p className="text-sm text-n700 mb-6 max-w-md">{description}</p>
      {onRetry && (
        <Button onClick={onRetry} variant="danger">Thử lại</Button>
      )}
    </div>
  );
};

export const Skeleton = ({ className = '' }: { className?: string }) => {
  return (
    <div className={`animate-pulse bg-n300 rounded-sm ${className}`} />
  );
};
