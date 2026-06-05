import React, { useEffect, useMemo, useState } from "react";
import { formatTripDate, generateDateRange } from "./lib/tripDates";

type ItineraryItem = {
  flowId: string;
  order: number;
  title: string;
  html: string;
  date: string | null;
  nextFlowId: string | null;
  prevFlowId: string | null;
};

type ApiResponse =
  | {
      ok: true;
      items: ItineraryItem[];
      meta?: { fetchedAt?: string; tripStart?: string; tripEnd?: string };
    }
  | { ok: false; error: string };

const DEFAULT_TRIP_START = "2026-07-16";
const DEFAULT_TRIP_END = "2026-07-23";
const UNDATED_KEY = "__undated__";

function countItemsByDate(items: ItineraryItem[], dates: string[]) {
  const counts = new Map<string, number>();
  for (const date of dates) counts.set(date, 0);
  let undated = 0;

  for (const item of items) {
    if (item.date && counts.has(item.date)) {
      counts.set(item.date, (counts.get(item.date) ?? 0) + 1);
    } else if (!item.date) {
      undated += 1;
    }
  }

  return { counts, undated };
}

function pickDefaultDate(
  dates: string[],
  counts: Map<string, number>,
  undated: number,
): string {
  const firstWithItems = dates.find((d) => (counts.get(d) ?? 0) > 0);
  if (firstWithItems) return firstWithItems;
  if (undated > 0) return UNDATED_KEY;
  return dates[0] ?? UNDATED_KEY;
}

export default function App() {
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [tripStart, setTripStart] = useState(DEFAULT_TRIP_START);
  const [tripEnd, setTripEnd] = useState(DEFAULT_TRIP_END);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string>(DEFAULT_TRIP_START);

  const apiUrl = useMemo(() => `/api/itinerary?nonce=${refreshNonce}`, [refreshNonce]);

  const tripDates = useMemo(
    () => generateDateRange(tripStart, tripEnd),
    [tripStart, tripEnd],
  );

  const { counts, undated } = useMemo(
    () => countItemsByDate(items, tripDates),
    [items, tripDates],
  );

  const dayItems = useMemo(() => {
    const filtered =
      selectedDate === UNDATED_KEY
        ? items.filter((it) => !it.date)
        : items.filter((it) => it.date === selectedDate);
    return [...filtered].sort((a, b) => a.order - b.order);
  }, [items, selectedDate]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(apiUrl, {
          headers: { "Cache-Control": "no-store" },
          signal: controller.signal,
        });
        const json = (await res.json()) as ApiResponse;
        if (cancelled) return;
        if (!json.ok) {
          setError(json.error);
          setItems([]);
          return;
        }

        const start = json.meta?.tripStart ?? DEFAULT_TRIP_START;
        const end = json.meta?.tripEnd ?? DEFAULT_TRIP_END;
        const dates = generateDateRange(start, end);
        const { counts: nextCounts, undated: nextUndated } = countItemsByDate(
          json.items,
          dates,
        );

        setTripStart(start);
        setTripEnd(end);
        setItems(json.items);
        setSelectedDate((prev) => {
          if (prev === UNDATED_KEY && nextUndated > 0) return UNDATED_KEY;
          if (dates.includes(prev) && (nextCounts.get(prev) ?? 0) > 0) return prev;
          return pickDefaultDate(dates, nextCounts, nextUndated);
        });
      } catch (e) {
        if (cancelled) return;
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : String(e));
        setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [apiUrl]);

  return (
    <div className="page">
      <div className="header">
        <h1 className="title">Trip Flow</h1>
        <p className="subtitle">
          依日期瀏覽行程，卡片間以時間軸呈現 next / previous 順序。
        </p>
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
        <>
          <div className="datePicker">
            <label className="datePickerLabel" htmlFor="trip-date">
              選擇日期
            </label>
            <select
              id="trip-date"
              className="dateSelect"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            >
              {tripDates.map((date) => {
                const count = counts.get(date) ?? 0;
                return (
                  <option key={date} value={date}>
                    {formatTripDate(date)}
                    {count > 0 ? ` · ${count} 個行程` : ""}
                  </option>
                );
              })}
              {undated > 0 && (
                <option value={UNDATED_KEY}>未排日期 · {undated} 個行程</option>
              )}
            </select>
          </div>

          {dayItems.length === 0 ? (
            <div className="status">這天還沒有行程安排。</div>
          ) : (
            <ol className="timeline" aria-label="行程時間軸">
              {dayItems.map((it, index) => {
                const nextItem = dayItems[index + 1];
                const isLinkedToNext =
                  !!nextItem &&
                  (it.nextFlowId === nextItem.flowId ||
                    nextItem.prevFlowId === it.flowId);

                return (
                  <li key={it.flowId} className="timelineItem">
                    <div className="timelineRail" aria-hidden="true">
                      <span className="timelineNode" />
                      {index < dayItems.length - 1 && (
                        <span
                          className={`timelineConnector${isLinkedToNext ? " isLinked" : ""}`}
                        />
                      )}
                    </div>
                    <article className="card timelineCard">
                      <h2>
                        {it.order}. {it.title}
                      </h2>
                      <div
                        className="content"
                        dangerouslySetInnerHTML={{ __html: it.html }}
                      />
                    </article>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}

      <div className="btnRow">
        <button type="button" onClick={() => setRefreshNonce((n) => n + 1)}>
          重新渲染（抓最新 Notion）
        </button>
      </div>
    </div>
  );
}
