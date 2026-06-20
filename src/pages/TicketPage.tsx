import { useEffect, useState } from "react";
import { TicketResponseSchema } from "@shared/api/auth";
import { apiFetch } from "../auth/apiFetch";
import { useAuth } from "../auth/AuthContext";
import { EmptyState } from "../components/EmptyState";
import { TicketIcon } from "../components/Nav/NavIcons";
import { parseApiResponse } from "../lib/parseApiResponse";

const ticketEmptyIcon = <TicketIcon className="emptyStateIcon" />;

export function TicketPage() {
  const { session } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await apiFetch("/api/ticket");
        const data = await parseApiResponse(res, TicketResponseSchema);
        if (!res.ok || !data.ok) {
          throw new Error("failed");
        }
        if (!cancelled) {
          setMessage(data.message);
        }
      } catch {
        if (!cancelled) {
          setError("無法載入票券資訊");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const emptyMessage = error ?? message ?? "載入中…";

  return (
    <main className="page">
      <header className="header">
        <h1 className="title">票券</h1>
        <p className="subtitle">
          {session?.user.displayName
            ? `${session.user.displayName} 的票券資訊`
            : "個人票券資訊"}
        </p>
      </header>

      <EmptyState message={emptyMessage} icon={ticketEmptyIcon} />
    </main>
  );
}
