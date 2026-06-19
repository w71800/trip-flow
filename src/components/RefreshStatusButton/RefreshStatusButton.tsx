import {
  CACHE_STATUS_LABEL,
  type CacheStatus,
  isCacheStatusBusy,
} from "../../lib/cacheStatus";
import "./RefreshStatusButton.css";

type RefreshStatusButtonProps = {
  status: CacheStatus;
  onRefresh: () => void;
};

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      className={`refreshStatusIcon${spinning ? " isSpinning" : ""}`}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <polyline points="21 3 21 9 15 9" />
    </svg>
  );
}

export function RefreshStatusButton({
  status,
  onRefresh,
}: RefreshStatusButtonProps) {
  const busy = isCacheStatusBusy(status);
  const label = CACHE_STATUS_LABEL[status];

  return (
    <button
      type="button"
      className={`refreshStatusButton${busy ? " isBusy" : ""}`}
      onClick={onRefresh}
      disabled={busy}
      aria-busy={busy}
      aria-live="polite"
    >
      <RefreshIcon spinning={busy} />
      <span className="refreshStatusLabel">{label}</span>
    </button>
  );
}
