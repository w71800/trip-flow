import { useEffect, useMemo, useRef, useState } from "react";
import { ItineraryResponseSchema, type ItineraryItem, type ItineraryMeta } from "@shared/api/itinerary";
import { EmptyDayState } from "../components/EmptyDayState";
import { RefreshStatusButton } from "../components/RefreshStatusButton";
import { Select } from "../components/Select";
import { TripCard } from "../components/TripCard";
import { CacheStatus } from "../lib/cacheStatus";
import { loadItineraryCache, saveItineraryCache } from "../lib/itineraryCache";
import { parseApiResponse } from "../lib/parseApiResponse";
import { formatTripDate, generateDateRange } from "../lib/tripDates";
import "./ItineraryPage.css";

const DEFAULT_TRIP_START = "2026-07-16";
const DEFAULT_TRIP_END = "2026-07-23";
const UNDATED_KEY = "__undated__";
const DAY_CONTENT_FADE_MS = 220;

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

function filterItemsByDate(items: ItineraryItem[], date: string) {
  const filtered =
    date === UNDATED_KEY
      ? items.filter((it) => !it.date)
      : items.filter((it) => it.date === date);
  return [...filtered].sort((a, b) => a.order - b.order);
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function ItineraryPage() {
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [tripStart, setTripStart] = useState(DEFAULT_TRIP_START);
  const [tripEnd, setTripEnd] = useState(DEFAULT_TRIP_END);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string>(DEFAULT_TRIP_START);
  const [displayDate, setDisplayDate] = useState<string>(DEFAULT_TRIP_START);
  const [contentVisible, setContentVisible] = useState(true);
  const [cacheStatus, setCacheStatus] = useState<CacheStatus>(CacheStatus.Loading);
  const animateDateChangeRef = useRef(false);

  const forceRefresh = refreshNonce > 0;
  const apiUrl = useMemo(
    () =>
      forceRefresh
        ? `/api/itinerary?refresh=1&_=${refreshNonce}`
        : `/api/itinerary`,
    [refreshNonce, forceRefresh],
  );

  const tripDates = useMemo(
    () => generateDateRange(tripStart, tripEnd),
    [tripStart, tripEnd],
  );

  const { counts, undated } = useMemo(
    () => countItemsByDate(items, tripDates),
    [items, tripDates],
  );

  const displayedDayItems = useMemo(
    () => filterItemsByDate(items, displayDate),
    [items, displayDate],
  );

  useEffect(() => {
    if (selectedDate === displayDate) return;

    if (!animateDateChangeRef.current || prefersReducedMotion()) {
      setDisplayDate(selectedDate);
      setContentVisible(true);
      return;
    }

    setContentVisible(false);
    const timer = window.setTimeout(() => {
      setDisplayDate(selectedDate);
      requestAnimationFrame(() => setContentVisible(true));
    }, DAY_CONTENT_FADE_MS);

    return () => window.clearTimeout(timer);
  }, [selectedDate, displayDate]);

  const dateOptions = useMemo(() => {
    const options = tripDates.map((date) => {
      const count = counts.get(date) ?? 0;
      return {
        value: date,
        label: `${formatTripDate(date)}${count > 0 ? ` · ${count} 個行程` : ""}`,
      };
    });

    if (undated > 0) {
      options.push({
        value: UNDATED_KEY,
        label: `未排日期 · ${undated} 個行程`,
      });
    }

    return options;
  }, [tripDates, counts, undated]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    function applyItinerary(nextItems: ItineraryItem[], meta?: Partial<ItineraryMeta>) {
      const start = meta?.tripStart ?? DEFAULT_TRIP_START;
      const end = meta?.tripEnd ?? DEFAULT_TRIP_END;
      const dates = generateDateRange(start, end);
      const { counts: nextCounts, undated: nextUndated } = countItemsByDate(
        nextItems,
        dates,
      );

      setTripStart(start);
      setTripEnd(end);
      setItems(nextItems);
      setSelectedDate((prev) => {
        if (prev === UNDATED_KEY && nextUndated > 0) return UNDATED_KEY;
        if (dates.includes(prev) && (nextCounts.get(prev) ?? 0) > 0) return prev;
        return pickDefaultDate(dates, nextCounts, nextUndated);
      });
    }

    async function run() {
      const localCache = forceRefresh ? null : loadItineraryCache();
      const hasLocalCache = !!localCache;

      if (hasLocalCache) {
        applyItinerary(localCache.items, localCache.meta);
        setCacheStatus(CacheStatus.CheckingLocal);
        setLoading(false);
      } else {
        setCacheStatus(CacheStatus.Loading);
        setLoading(true);
      }

      setError(null);

      try {
        const headers: Record<string, string> = {};
        if (localCache?.etag && !forceRefresh) {
          headers["If-None-Match"] = localCache.etag;
        }

        const res = await fetch(apiUrl, {
          headers,
          signal: controller.signal,
        });

        if (cancelled) return;

        if (res.status === 304) {
          setCacheStatus(CacheStatus.Unchanged);
          return;
        }

        const json = await parseApiResponse(res, ItineraryResponseSchema);
        if (!json.ok) {
          if (!hasLocalCache) {
            setError(json.error);
            setItems([]);
          }
          return;
        }

        applyItinerary(json.items, json.meta);

        const etag = res.headers.get("ETag");
        if (etag) {
          saveItineraryCache({
            etag,
            items: json.items,
            meta: json.meta,
            savedAt: new Date().toISOString(),
          });
        }

        setCacheStatus(
          json.meta.cached ? CacheStatus.ServerCached : CacheStatus.Updated,
        );
      } catch (e) {
        if (cancelled) return;
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (!hasLocalCache) {
          setError(e instanceof Error ? e.message : String(e));
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [apiUrl, forceRefresh]);

  function handleRefresh() {
    setCacheStatus(CacheStatus.Loading);
    setRefreshNonce((n) => n + 1);
  }

  function handleDateChange(nextDate: string) {
    if (nextDate === selectedDate) return;
    animateDateChangeRef.current = true;
    setSelectedDate(nextDate);
  }

  return (
    <div className="page">
      <div className="pageToolbar">
        <RefreshStatusButton status={cacheStatus} onRefresh={handleRefresh} />
      </div>
      <div className="header">
        <h1 className="title">行程時間軸</h1>
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
            <label
              id="trip-date-label"
              className="datePickerLabel"
              htmlFor="trip-date"
            >
              選擇日期
            </label>
            <Select
              id="trip-date"
              value={selectedDate}
              options={dateOptions}
              onChange={handleDateChange}
              aria-labelledby="trip-date-label"
            />
          </div>

          <div
            className={`dayContent${contentVisible ? " isVisible" : ""}`}
            aria-hidden={!contentVisible}
          >
            {displayedDayItems.length === 0 ? (
              <EmptyDayState />
            ) : (
              <ol className="timeline" aria-label="行程時間軸">
                {displayedDayItems.map((it, index) => {
                  const nextItem = displayedDayItems[index + 1];
                  const isLinkedToNext =
                    !!nextItem &&
                    (it.nextFlowId === nextItem.flowId ||
                      nextItem.prevFlowId === it.flowId);

                  return (
                    <TripCard
                      key={it.flowId}
                      order={it.order}
                      title={it.title}
                      html={it.html}
                      isLast={index === displayedDayItems.length - 1}
                      isLinkedToNext={isLinkedToNext}
                    />
                  );
                })}
              </ol>
            )}
          </div>
        </>
      )}
    </div>
  );
}
