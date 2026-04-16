import React from 'react';
import { AlertTriangle } from 'lucide-react';

export default function AlertBadge({ label }) {
  return (
    <div className="flex items-center gap-1 bg-red-100 text-red-800 rounded-md px-2 py-1 text-xs">
      <AlertTriangle size={12} />
      <span>{label}</span>
    </div>
  );
}
