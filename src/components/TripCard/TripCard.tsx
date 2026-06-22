import { useEffect, useRef, useState } from "react";
import { fetchItineraryItemContent } from "../../lib/fetchItineraryItemContent";
import "./TripCard.css";

type TripCardProps = {
  tripSlug: string;
  flowId: string;
  title: string;
  html: string;
  hasMoreContent: boolean;
  isLast: boolean;
  isLinkedToNext: boolean;
};

export function TripCard({
  tripSlug,
  flowId,
  title,
  html,
  hasMoreContent,
  isLast,
  isLinkedToNext,
}: TripCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [fullHtml, setFullHtml] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  async function handleShowMore() {
    if (fullHtml) {
      setExpanded(true);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoadingMore(true);
    setLoadError(null);

    try {
      const nextHtml = await fetchItineraryItemContent(
        tripSlug,
        flowId,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setFullHtml(nextHtml);
      setExpanded(true);
    } catch (e) {
      if (controller.signal.aborted) return;
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!controller.signal.aborted) {
        setLoadingMore(false);
      }
    }
  }

  function handleCollapse() {
    setExpanded(false);
  }

  const displayHtml = expanded && fullHtml ? fullHtml : html;
  const showMoreButton = hasMoreContent && !expanded;
  const showCollapseButton = hasMoreContent && expanded;

  return (
    <li className="timelineItem">
      <div className="timelineRail" aria-hidden="true">
        <span className="timelineNode" />
        {!isLast && (
          <span
            className={`timelineConnector${isLinkedToNext ? " isLinked" : ""}`}
          />
        )}
      </div>
      <article className="card timelineCard">
        <h2>{title}</h2>
        {displayHtml.trim() && (
          <div
            className="content"
            dangerouslySetInnerHTML={{ __html: displayHtml }}
          />
        )}
        {showMoreButton && (
          <button
            type="button"
            className="contentToggle"
            onClick={handleShowMore}
            disabled={loadingMore}
            aria-expanded={false}
          >
            {loadingMore ? "載入中…" : "顯示更多"}
          </button>
        )}
        {loadError && (
          <p className="contentToggleError" role="alert">
            {loadError}
          </p>
        )}
        {showCollapseButton && (
          <button
            type="button"
            className="contentToggle"
            onClick={handleCollapse}
            aria-expanded={true}
          >
            收合
          </button>
        )}
      </article>
    </li>
  );
}
