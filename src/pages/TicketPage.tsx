import { useEffect, useState } from "react";
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

function TicketCard({
  label,
  images,
}: {
  label?: string | null;
  images: Array<{ url: string; name?: string | null }>;
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
              <img
                src={image.url}
                alt={image.name ?? title}
                loading="lazy"
              />
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
}: {
  group: TicketDateGroup;
  defaultOpen: boolean;
}) {
  return (
    <details className="ticketToggle" open={defaultOpen}>
      <summary className="ticketToggleSummary">
        {formatTripDate(group.date)}
        <span className="ticketToggleCount">{group.tickets.length} 張</span>
      </summary>
      <div className="ticketToggleBody">
        {group.tickets.map((ticket) => (
          <TicketCard key={`${group.date}-${ticket.id}`} {...ticket} />
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
            />
          ))}
        </div>
      )}
    </main>
  );
}
