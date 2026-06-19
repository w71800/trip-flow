export const CacheStatus = {
  Idle: "idle",
  Loading: "loading",
  CheckingLocal: "checking_local",
  Unchanged: "unchanged",
  ServerCached: "server_cached",
  Updated: "updated",
} as const;

export type CacheStatus = (typeof CacheStatus)[keyof typeof CacheStatus];

export const CACHE_STATUS_LABEL: Record<CacheStatus, string> = {
  [CacheStatus.Idle]: "重新整理",
  [CacheStatus.Loading]: "載入中…",
  [CacheStatus.CheckingLocal]: "已使用本機快取，正在確認是否有更新…",
  [CacheStatus.Unchanged]: "內容未變更，沿用快取",
  [CacheStatus.ServerCached]: "內容未變更，沿用伺服器快取",
  [CacheStatus.Updated]: "已更新為最新內容",
};

export function isCacheStatusBusy(status: CacheStatus): boolean {
  return (
    status === CacheStatus.Loading || status === CacheStatus.CheckingLocal
  );
}
