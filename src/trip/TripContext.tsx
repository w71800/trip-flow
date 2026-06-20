import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useParams } from "react-router-dom";
import { TripDetailResponseSchema, type TripDetail } from "@shared/api/trips";
import { parseApiResponse } from "../lib/parseApiResponse";

type TripContextValue = {
  slug: string;
  trip: TripDetail | null;
  isLoading: boolean;
  error: string | null;
};

const TripContext = createContext<TripContextValue | null>(null);

type TripProviderProps = {
  children: ReactNode;
};

export function TripProvider({ children }: TripProviderProps) {
  const { tripSlug } = useParams();
  const slug = tripSlug?.trim() ?? "";
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setTrip(null);
      setError("缺少旅行 slug");
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function run() {
      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/trips/${encodeURIComponent(slug)}`, {
          signal: controller.signal,
        });
        const json = await parseApiResponse(res, TripDetailResponseSchema);
        if (cancelled) return;

        if (!json.ok) {
          setTrip(null);
          setError(json.error);
          return;
        }

        setTrip(json.trip);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof DOMException && e.name === "AbortError") return;
        setTrip(null);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [slug]);

  const value = useMemo(
    () => ({
      slug,
      trip,
      isLoading,
      error,
    }),
    [slug, trip, isLoading, error],
  );

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

export function useTrip() {
  const context = useContext(TripContext);
  if (!context) {
    throw new Error("useTrip 必須在 TripProvider 內使用");
  }
  return context;
}

export function useTripOptional() {
  return useContext(TripContext);
}
