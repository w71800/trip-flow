import type { ReactNode } from "react";
import "./EmptyState.css";

type EmptyStateProps = {
  message: string;
  icon: ReactNode;
};

export function EmptyState({ message, icon }: EmptyStateProps) {
  return (
    <div className="emptyState" role="status">
      <div className="emptyStateIconWrap" aria-hidden="true">
        {icon}
      </div>
      <p className="emptyStateText">{message}</p>
    </div>
  );
}
