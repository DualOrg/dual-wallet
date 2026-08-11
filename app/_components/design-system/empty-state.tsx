import { Box } from "lucide-react";

export function EmptyState({
  title,
  description,
  icon: Icon = Box,
  action,
}: {
  title: string;
  description: string;
  icon?: typeof Box;
  action?: React.ReactNode;
}) {
  return (
    <div className="card empty-state">
      <div>
        <span className="empty-icon">
          <Icon size={27} aria-hidden />
        </span>
        <h2>{title}</h2>
        <p>{description}</p>
        {action ? <div className="load-more">{action}</div> : null}
      </div>
    </div>
  );
}
