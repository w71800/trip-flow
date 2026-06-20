import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TripsListResponseSchema, type TripSummary } from "@shared/api/trips";
import { apiFetch } from "../auth/apiFetch";
import { useAuth } from "../auth/AuthContext";
import { parseApiResponse } from "../lib/parseApiResponse";
import { formatTripDate } from "../lib/tripDates";
import "./TripsOverviewPage.css";

function TripCard({ trip }: { trip: TripSummary }) {
  return (
    <Link to={`/${trip.slug}`} className="tripOverviewCard">
      <div className="tripOverviewCardHeader">
        <h2 className="tripOverviewCardTitle">{trip.displayName}</h2>
        <span className="tripOverviewCardStatus">{trip.status}</span>
      </div>
      <p className="tripOverviewCardMeta">
        {formatTripDate(trip.tripStart)} – {formatTripDate(trip.tripEnd)}
      </p>
      <p className="tripOverviewCardSlug">/{trip.slug}</p>
    </Link>
  );
}

export function TripsOverviewPage() {
  const { session, isLoading: authLoading } = useAuth();
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) {
      setTrips([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);

      try {
        const res = await apiFetch("/api/trips");
        const json = await parseApiResponse(res, TripsListResponseSchema);
        if (cancelled) return;

        if (!json.ok) {
          setTrips([]);
          setError(json.error);
          return;
        }

        setTrips(json.trips);
      } catch (e) {
        if (cancelled) return;
        setTrips([]);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [session]);

  return (
    <main className="page tripsOverviewPage">
      <header className="header">
        <h1 className="title">我的旅行</h1>
        <p className="subtitle">選擇一趟旅行以查看行程與資訊</p>
      </header>

      {authLoading && <p className="status">載入中…</p>}

      {!authLoading && !session && (
        <div className="tripsOverviewGuest">
          <p>登入後即可查看你參與的旅行。</p>
          <Link to="/login" className="tripsOverviewLoginLink">
            前往登入
          </Link>
        </div>
      )}

      {!authLoading && session && loading && <p className="status">載入旅行清單…</p>}

      {!authLoading && session && error && (
        <p className="status" role="alert">
          {error}
        </p>
      )}

      {!authLoading && session && !loading && !error && trips.length === 0 && (
        <p className="status">目前沒有你可存取的旅行。</p>
      )}

      {!authLoading && session && !loading && !error && trips.length > 0 && (
        <div className="tripsOverviewGrid">
          {trips.map((trip) => (
            <TripCard key={trip.slug} trip={trip} />
          ))}
        </div>
      )}
    </main>
  );
}
