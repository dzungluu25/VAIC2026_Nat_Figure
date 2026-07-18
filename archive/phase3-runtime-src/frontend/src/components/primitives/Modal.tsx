import React, { useEffect } from 'react';
import { Button } from './Button';

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export const Modal = ({ isOpen, onClose, title, children, footer }: ModalProps) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-n900/50 flex items-center justify-center p-4 transition-opacity duration-200">
      <div 
        className="bg-n100 rounded-sm shadow-md w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="px-6 py-4 border-b border-n300 flex justify-between items-center">
          <h2 id="modal-title" className="text-lg font-semibold text-n900">{title}</h2>
          <Button variant="secondary" onClick={onClose} className="!px-2 !py-1 text-xs">Đóng</Button>
        </div>
        
        <div className="p-6 overflow-y-auto">
          {children}
        </div>
        
        {footer && (
          <div className="px-6 py-4 border-t border-n300 bg-n100/50 flex justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
