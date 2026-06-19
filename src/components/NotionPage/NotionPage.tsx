import { useEffect, useMemo, useState } from "react";
import "./NotionPage.css";

type PageMeta = {
  fetchedAt?: string;
  lastEditedTime?: string;
  cached?: boolean;
};

type PageResponse =
  | {
      ok: true;
      key: string;
      title: string;
      icon: string | null;
      html: string;
      meta?: PageMeta;
    }
  | { ok: false; error: string };

type NotionPageViewProps = {
  pageKey: "flight" | "accommodation";
  refreshLabel?: string;
};

function isEmojiIcon(icon: string | null): boolean {
  if (!icon) return false;
  return !/^https?:\/\//i.test(icon);
}

export function NotionPageView({ pageKey, refreshLabel = "重新整理" }: NotionPageViewProps) {
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cacheHint, setCacheHint] = useState<string | null>(null);
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

      try {
        const res = await fetch(apiUrl, { signal: controller.signal });
        if (cancelled) return;

        if (res.status === 304) {
          setCacheHint("內容未變更");
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
        setCacheHint(
          json.meta?.cached ? "已使用快取" : "已更新為最新內容",
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

  return (
    <div className="notionPageShell">
      <div className="notionPageToolbar">
        <button type="button" onClick={() => setRefreshNonce((n) => n + 1)}>
          {refreshLabel}
        </button>
        {cacheHint && <span className="notionPageHint">{cacheHint}</span>}
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
