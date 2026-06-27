type NotionSchema = { properties?: Record<string, { type?: string }> };

export type FlowPropertyConfig = {
  flowTitleProperty?: string;
  flowNextProperty?: string;
  flowPreviousProperty?: string;
  flowDetailsProperty?: string;
  flowDateProperty?: string;
};

export type FlowPropertyNames = {
  titlePropertyName: string;
  nextPropertyName: string;
  prevPropertyName: string;
  detailsPropertyName: string | null;
  datePropertyName: string | null;
};

export function getTitleFromPage(page: unknown, titlePropertyName: string): string {
  const properties = (page as { properties?: Record<string, unknown> })?.properties;
  const prop = properties?.[titlePropertyName] as
    | { type?: string; title?: Array<{ plain_text?: string }> }
    | undefined;
  if (!prop) return "";
  if (prop.type !== "title") return "";
  const titleParts = (prop.title ?? []).map((t) => t.plain_text ?? "");
  return titleParts.join("").trim();
}

export function getRelationIds(prop: unknown): string[] {
  const relationProp = prop as { type?: string; relation?: Array<{ id?: string }> } | null | undefined;
  if (!relationProp || relationProp.type !== "relation") return [];
  return (relationProp.relation ?? []).map((r) => r.id).filter(Boolean) as string[];
}

export function pickTitlePropertyName(schema: NotionSchema, override?: string) {
  if (override) return override;
  for (const [name, prop] of Object.entries(schema?.properties ?? {})) {
    if (prop?.type === "title") return name;
  }
  throw new Error(
    "找不到 title 欄位；請在 .env 設定 NOTION_FLOW_TITLE_PROPERTY（你的 database 可能是「名稱」）。",
  );
}

export function pickDatePropertyName(schema: NotionSchema, override?: string) {
  if (override) return override;

  const dateCandidates: string[] = [];
  for (const [name, prop] of Object.entries(schema?.properties ?? {})) {
    if (prop?.type === "date") dateCandidates.push(name);
  }

  const datePatterns = [/日期/i, /date/i, /時間/i, /time/i, /day/i];
  for (const name of dateCandidates) {
    if (datePatterns.some((re) => re.test(name))) return name;
  }

  return dateCandidates[0] ?? null;
}

export function getDateFromPage(page: unknown, datePropertyName: string | null): string | null {
  if (!datePropertyName) return null;
  const properties = (page as { properties?: Record<string, unknown> })?.properties;
  const prop = properties?.[datePropertyName] as
    | { type?: string; date?: { start?: string } }
    | undefined;
  if (!prop || prop.type !== "date" || !prop.date?.start) return null;
  return String(prop.date.start).slice(0, 10);
}

export function pickRelationPropertyName(
  schema: NotionSchema,
  override: string | undefined,
  mode: "next" | "previous" | "details",
) {
  if (override) return override;

  const relationCandidates: string[] = [];
  for (const [name, prop] of Object.entries(schema?.properties ?? {})) {
    if (prop?.type === "relation") relationCandidates.push(name);
  }

  const includesAny = (value: string, patterns: RegExp[]) =>
    patterns.some((re) => re.test(value));

  if (mode === "next") {
    const nextPatterns = [/next/i, /下一/i, /後一|後續|下一步/i];
    for (const n of relationCandidates) if (includesAny(n, nextPatterns)) return n;
  }
  if (mode === "previous") {
    const prevPatterns = [/previous/i, /上一/i, /前一|前段|之前|上一步|prev/i];
    for (const n of relationCandidates) if (includesAny(n, prevPatterns)) return n;
  }
  if (mode === "details") {
    const detailPatterns = [/行程/i, /details?/i, /連結|連接/i, /link/i, /page/i];
    for (const n of relationCandidates) if (includesAny(n, detailPatterns)) return n;
  }

  return null;
}

export function pickFlowPropertyNames(
  dataSource: NotionSchema,
  config: FlowPropertyConfig,
): FlowPropertyNames {
  const titlePropertyName = pickTitlePropertyName(dataSource, config.flowTitleProperty);
  const nextPropertyName = pickRelationPropertyName(
    dataSource,
    config.flowNextProperty,
    "next",
  );
  const prevPropertyName = pickRelationPropertyName(
    dataSource,
    config.flowPreviousProperty,
    "previous",
  );
  const detailsPropertyName = pickRelationPropertyName(
    dataSource,
    config.flowDetailsProperty,
    "details",
  );
  const datePropertyName = pickDatePropertyName(dataSource, config.flowDateProperty);

  if (!nextPropertyName || !prevPropertyName) {
    throw new Error(
      "找不到 next/previous 關聯欄位；請設定 NOTION_FLOW_NEXT_PROPERTY 與 NOTION_FLOW_PREVIOUS_PROPERTY。",
    );
  }

  return {
    titlePropertyName,
    nextPropertyName,
    prevPropertyName,
    detailsPropertyName,
    datePropertyName,
  };
}
