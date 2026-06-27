import { useCallback, useEffect, useState } from "react";
import { TicketResponseSchema, type TicketDateGroup } from "@shared/api/auth";
import { apiFetch } from "../auth/apiFetch";
import { useAuth } from "../auth/AuthContext";
import { EmptyState } from "../components/EmptyState";
import { TicketIcon } from "../components/Nav/NavIcons";
import { formatTripDate } from "../lib/tripDates";
import { parseApiResponse } from "../lib/parseApiResponse";
import { useTrip } from "../trip/TripContext";
import "./TicketPage.css";

const ticketEmptyIcon = <TicketIcon className="emptyStateIcon" />;

type TicketImagePreviewState = {
  url: string;
  alt: string;
};

function TicketImagePreview({
  preview,
  onClose,
}: {
  preview: TicketImagePreviewState;
  onClose: () => void;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="ticketPreviewOverlay"
      role="dialog"
      aria-modal="true"
      aria-label={preview.alt}
      onClick={onClose}
    >
      <div className="ticketPreviewPanel" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="ticketPreviewClose"
          aria-label="關閉預覽"
          onClick={onClose}
        >
          ✕
        </button>
        <img
          className="ticketPreviewImage"
          src={preview.url}
          alt={preview.alt}
        />
        {preview.alt ? <p className="ticketPreviewCaption">{preview.alt}</p> : null}
      </div>
    </div>
  );
}

function TicketCard({
  label,
  images,
  onImageClick,
}: {
  label?: string | null;
  images: Array<{ url: string; name?: string | null }>;
  onImageClick: (preview: TicketImagePreviewState) => void;
}) {
  const title = label?.trim() || "票券";

  return (
    <article className="ticketCard">
      <header className="ticketCardHeader">
        <h3 className="ticketCardTitle">{title}</h3>
      </header>
      {images.length > 0 ? (
        <div className="ticketImages">
          {images.map((image) => (
            <figure key={image.url} className="ticketImage">
              <button
                type="button"
                className="ticketImageButton"
                aria-label={`放大預覽：${image.name ?? title}`}
                onClick={() =>
                  onImageClick({
                    url: image.url,
                    alt: image.name ?? title,
                  })
                }
              >
                <img
                  src={image.url}
                  alt={image.name ?? title}
                  loading="lazy"
                />
              </button>
            </figure>
          ))}
        </div>
      ) : (
        <p className="ticketNoImage">尚無票券圖片</p>
      )}
    </article>
  );
}

function TicketDateToggle({
  group,
  defaultOpen,
  onImageClick,
}: {
  group: TicketDateGroup;
  defaultOpen: boolean;
  onImageClick: (preview: TicketImagePreviewState) => void;
}) {
  return (
    <details className="ticketToggle" open={defaultOpen}>
      <summary className="ticketToggleSummary">
        {formatTripDate(group.date)}
        <span className="ticketToggleCount">{group.tickets.length} 張</span>
      </summary>
      <div className="ticketToggleBody">
        {group.tickets.map((ticket) => (
          <TicketCard
            key={`${group.date}-${ticket.id}`}
            {...ticket}
            onImageClick={onImageClick}
          />
        ))}
      </div>
    </details>
  );
}

export function TicketPage() {
  const { session } = useAuth();
  const { slug, trip, error: tripError, isLoading: tripLoading } = useTrip();
  const [groups, setGroups] = useState<TicketDateGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<TicketImagePreviewState | null>(null);

  const openPreview = useCallback((next: TicketImagePreviewState) => {
    setPreview(next);
  }, []);

  const closePreview = useCallback(() => {
    setPreview(null);
  }, []);

  useEffect(() => {
    if (!slug || tripError) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await apiFetch(`/api/trips/${encodeURIComponent(slug)}/ticket`);
        const data = await parseApiResponse(res, TicketResponseSchema);
        if (cancelled) return;

        if (!data.ok) {
          setError(data.error || "無法載入票券資訊");
          setGroups(null);
          return;
        }

        setGroups(data.groups);
      } catch (e) {
        if (!cancelled) {
          const message =
            e instanceof Error && e.message.startsWith("資料格式錯誤")
              ? e.message
              : "無法載入票券資訊";
          setError(message);
          setGroups(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, tripError]);

  const showEmpty = !loading && !tripError && !error && (groups?.length ?? 0) === 0;
  const emptyMessage =
    tripError ??
    error ??
    (tripLoading || loading ? "載入中…" : "尚無票券");

  return (
    <main className="page">
      <header className="header">
        <h1 className="title">票券</h1>
        <p className="subtitle">
          {session?.user.displayName
            ? `${session.user.displayName} 的票券資訊`
            : "個人票券資訊"}
          {trip?.displayName ? ` · ${trip.displayName}` : ""}
        </p>
      </header>

      {showEmpty ? (
        <EmptyState message={emptyMessage} icon={ticketEmptyIcon} />
      ) : error || tripError ? (
        <EmptyState message={emptyMessage} icon={ticketEmptyIcon} />
      ) : loading || groups === null ? (
        <p className="status">載入中…</p>
      ) : (
        <div className="ticketGroups">
          {groups.map((group, index) => (
            <TicketDateToggle
              key={group.date}
              group={group}
              defaultOpen={index === 0}
              onImageClick={openPreview}
            />
          ))}
        </div>
      )}

      {preview ? (
        <TicketImagePreview preview={preview} onClose={closePreview} />
      ) : null}
    </main>
  );
}
