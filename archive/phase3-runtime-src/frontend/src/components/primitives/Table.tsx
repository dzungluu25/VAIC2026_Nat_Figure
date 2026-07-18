import React from 'react';

export const Table = ({ className = '', children, ...props }: React.HTMLAttributes<HTMLTableElement>) => (
  <div className="w-full overflow-auto">
    <table className={`w-full caption-bottom text-sm ${className}`} {...props}>
      {children}
    </table>
  </div>
);

export const TableHeader = ({ className = '', children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <thead className={`border-b border-n300 bg-n100/50 ${className}`} {...props}>
    {children}
  </thead>
);

export const TableBody = ({ className = '', children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody className={`[&_tr:last-child]:border-0 ${className}`} {...props}>
    {children}
  </tbody>
);

export const TableRow = ({ className = '', children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
  <tr className={`border-b border-n300 transition-colors hover:bg-n100/50 data-[state=selected]:bg-n100 ${className}`} {...props}>
    {children}
  </tr>
);

export const TableHead = ({ className = '', children, ...props }: React.HTMLAttributes<HTMLTableCellElement>) => (
  <th className={`h-12 px-4 text-left align-middle font-semibold text-n700 ${className}`} {...props}>
    {children}
  </th>
);

export const TableCell = ({ className = '', children, ...props }: React.HTMLAttributes<HTMLTableCellElement>) => (
  <td className={`p-4 align-middle text-n900 ${className}`} {...props}>
    {children}
  </td>
);
