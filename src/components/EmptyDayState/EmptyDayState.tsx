import { EmptyState } from "../EmptyState";

type EmptyDayIconProps = {
  className?: string;
};

function EmptyDayIcon({ className }: EmptyDayIconProps) {
  return (
    <svg
      className={className}
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="8" y1="16" x2="16" y2="16" />
    </svg>
  );
}

type EmptyDayStateProps = {
  message?: string;
};

export function EmptyDayState({
  message = "這天還沒有行程安排。",
}: EmptyDayStateProps) {
  return (
    <EmptyState
      message={message}
      icon={<EmptyDayIcon className="emptyStateIcon" />}
    />
  );
}
