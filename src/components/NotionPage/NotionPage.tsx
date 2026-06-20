import type { PageKey, PageResponse } from "@shared/api/pages";
import { useEffect, useMemo, useState } from "react";
import { RefreshStatusButton } from "../RefreshStatusButton";
import { CacheStatus } from "../../lib/cacheStatus";
import "./NotionPage.css";

type NotionPageViewProps = {
  pageKey: PageKey;
};

function isEmojiIcon(icon: string | null): boolean {
  if (!icon) return false;
  return !/^https?:\/\//i.test(icon);
}

export function NotionPageView({ pageKey }: NotionPageViewProps) {
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cacheStatus, setCacheStatus] = useState<CacheStatus>(CacheStatus.Loading);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const apiUrl = useMemo(
    () =>
      refreshNonce > 0
        ? `/api/pages/${pageKey}?refresh=1&_=${refreshNonce}`
        : `/api/pages/${pageKey}`,
    [pageKey, refreshNonce],
  );

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function run() {
      setLoading(true);
      setError(null);
      setCacheStatus(CacheStatus.Loading);

      try {
        const res = await fetch(apiUrl, { signal: controller.signal });
        if (cancelled) return;

        if (res.status === 304) {
          setCacheStatus(CacheStatus.Unchanged);
          setLoading(false);
          return;
        }

        const json = (await res.json()) as PageResponse;
        if (!json.ok) {
          setError(json.error);
          setHtml("");
          return;
        }

        setTitle(json.title);
        setIcon(json.icon);
        setHtml(json.html);
        setCacheStatus(
          json.meta?.cached ? CacheStatus.ServerCached : CacheStatus.Updated,
        );
      } catch (e) {
        if (cancelled) return;
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : String(e));
        setHtml("");
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

  function handleRefresh() {
    setCacheStatus(CacheStatus.Loading);
    setRefreshNonce((n) => n + 1);
  }

  return (
    <div className="page notionPageShell">
      <div className="pageToolbar">
        <RefreshStatusButton status={cacheStatus} onRefresh={handleRefresh} />
      </div>

      <article className="notionPage">
        <header className="notionPageHeader">
          {icon && (
            <div className="notionPageIcon" aria-hidden="true">
              {isEmojiIcon(icon) ? (
                <span className="notionPageEmoji">{icon}</span>
              ) : (
                <img src={icon} alt="" />
              )}
            </div>
          )}
          <h1 className="notionPageTitle">{title || "載入中…"}</h1>
        </header>

        {loading && <div className="notionPageStatus">載入中…</div>}
        {error && (
          <div className="notionPageStatus notionPageError" role="alert">
            {error}
          </div>
        )}

        {!loading && !error && html.trim() && (
          <div
            className="notionPageContent"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}

        {!loading && !error && !html.trim() && (
          <div className="notionPageStatus">此頁面目前沒有可顯示的內容。</div>
        )}
      </article>
    </div>
  );
}
