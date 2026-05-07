import { AlertTriangle } from "lucide-react";

export default function AlertBadge({ label }) {
  return (
    <div
      className="dashboard-status-badge flex items-center gap-1 px-2 py-1 text-xs"
      data-tone="danger"
    >
      <AlertTriangle size={12} />
      <span>{label}</span>
    </div>
  );
}
