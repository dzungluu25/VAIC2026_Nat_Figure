import React from 'react';

export const Card = ({ className = '', children, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  return (
    <div className={`bg-n100 border border-n300 rounded-sm shadow-sm overflow-hidden ${className}`} {...props}>
      {children}
    </div>
  );
};

export const CardHeader = ({ className = '', children, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  return (
    <div className={`px-6 py-4 border-b border-n300 ${className}`} {...props}>
      {children}
    </div>
  );
};

export const CardTitle = ({ className = '', children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => {
  return (
    <h3 className={`text-lg font-semibold text-n900 ${className}`} {...props}>
      {children}
    </h3>
  );
};

export const CardContent = ({ className = '', children, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  return (
    <div className={`p-6 ${className}`} {...props}>
      {children}
    </div>
  );
};
