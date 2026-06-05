import React, { useEffect, useMemo, useState } from "react";

type ItineraryItem = {
  flowId: string;
  order: number;
  title: string;
  html: string;
};

type ApiResponse =
  | { ok: true; items: ItineraryItem[]; meta?: { fetchedAt?: string } }
  | { ok: false; error: string };

export default function App() {
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const apiUrl = useMemo(() => `/api/itinerary?nonce=${refreshNonce}`, [refreshNonce]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(apiUrl, { headers: { "Cache-Control": "no-store" } });
        const json = (await res.json()) as ApiResponse;
        if (cancelled) return;
        if (!json.ok) {
          setError(json.error);
          setItems([]);
          return;
        }
        setItems(json.items);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  return (
    <div className="page">
      <div className="header">
        <h1 className="title">Trip Flow</h1>
        <p className="subtitle">依 Notion `next / previous` 排序，跳過無連結行程。</p>
      </div>

      {loading && <div className="status">載入中...</div>}
      {error && (
        <div className="status" role="alert">
          {error}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="status">目前沒有可呈現的行程（可能皆未設定連結）。</div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="grid" aria-label="行程卡片列表">
          {items.map((it) => (
            <article key={it.flowId} className="card">
              <h2>
                {it.order}. {it.title}
              </h2>
              <div className="content" dangerouslySetInnerHTML={{ __html: it.html }} />
            </article>
          ))}
        </div>
      )}

      <div className="btnRow">
        <button type="button" onClick={() => setRefreshNonce((n) => n + 1)}>
          重新渲染（抓最新 Notion）
        </button>
      </div>
    </div>
  );
}

