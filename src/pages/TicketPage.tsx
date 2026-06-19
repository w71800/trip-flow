import { useEffect, useState } from "react";
import { apiFetch } from "../auth/apiFetch";
import { useAuth } from "../auth/AuthContext";

type TicketResponse =
  | { ok: true; message: string; user: { id: string; displayName: string } }
  | { ok: false; error: string };

export function TicketPage() {
  const { session } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await apiFetch("/api/ticket");
        const data = (await res.json()) as TicketResponse;
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

      {error ? (
        <p className="status">{error}</p>
      ) : (
        <p className="status">{message ?? "載入中…"}</p>
      )}
    </main>
  );
}
