import type { Client } from "@notionhq/client";

type NotionRichText = {
  type: string;
  plain_text?: string;
  href?: string | null;
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    code?: boolean;
    color?: string;
  };
};

type RenderOptions = {
  maxBlocks?: number;
  fetched?: { count: number };
};

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return ch;
    }
  });
}

function escapeAttr(s: string) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

function colorClass(color: string | undefined): string {
  if (!color || color === "default") return "";
  return ` notion-color-${color.replace(/_/g, "-")}`;
}

function renderRichText(richText: NotionRichText[] | undefined): string {
  const parts = (richText ?? []).map((rt) => {
    const text = escapeHtml(rt.plain_text ?? "");
    const href = rt.href ?? null;
    const annotations = rt.annotations ?? {};
    const color = annotations.color ?? "default";

    let inner = text;
    if (annotations.code) inner = `<code>${inner}</code>`;
    if (annotations.bold) inner = `<strong>${inner}</strong>`;
    if (annotations.italic) inner = `<em>${inner}</em>`;
    if (annotations.underline) inner = `<u>${inner}</u>`;
    if (annotations.strikethrough) inner = `<s>${inner}</s>`;

    const colorCls = colorClass(color);
    if (colorCls) inner = `<span class="notion-text${colorCls}">${inner}</span>`;

    if (href) {
      const safeHref = escapeAttr(href);
      return `<a href="${safeHref}" target="_blank" rel="noreferrer">${inner}</a>`;
    }
    return inner;
  });

  return parts.join("");
}

function richTextToPlainText(richText: NotionRichText[] | undefined): string {
  return (richText ?? []).map((rt) => rt.plain_text ?? "").join("");
}

function calloutIcon(block: any): string {
  const icon = block.callout?.icon;
  if (!icon) return "💡";
  if (icon.type === "emoji" && icon.emoji) return icon.emoji;
  if (icon.type === "external" && icon.external?.url) {
    return `<img src="${escapeAttr(icon.external.url)}" alt="" class="notion-callout-img" />`;
  }
  if (icon.type === "file" && icon.file?.url) {
    return `<img src="${escapeAttr(icon.file.url)}" alt="" class="notion-callout-img" />`;
  }
  return "💡";
}

async function fetchBlockChildren(
  notion: Client,
  blockId: string,
  pageSize = 100,
): Promise<any[]> {
  const blocks: any[] = [];
  let startCursor: string | undefined;

  while (true) {
    const res: any = await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: startCursor,
      page_size: pageSize,
    });
    blocks.push(...(res.results ?? []));
    if (!res.has_more) break;
    startCursor = res.next_cursor ?? undefined;
  }

  return blocks;
}

function shouldStop(options: RenderOptions): boolean {
  const max = options.maxBlocks ?? 200;
  return (options.fetched?.count ?? 0) >= max;
}

function trackBlock(options: RenderOptions): boolean {
  if (!options.fetched) options.fetched = { count: 0 };
  if (shouldStop(options)) return false;
  options.fetched.count += 1;
  return true;
}

async function renderSingleBlock(
  notion: Client,
  block: any,
  options: RenderOptions,
): Promise<string> {
  if (!trackBlock(options)) return "";

  const type = block.type;

  if (type === "divider") {
    return `<hr class="notion-divider" />`;
  }

  if (type === "paragraph") {
    const html = renderRichText(block.paragraph?.rich_text);
    if (!html.trim()) return `<p class="notion-paragraph notion-empty">&nbsp;</p>`;
    return `<p class="notion-paragraph">${html}</p>`;
  }

  if (type === "heading_1") {
    const html = renderRichText(block.heading_1?.rich_text);
    if (!html.trim()) return "";
    return `<h1 class="notion-heading notion-h1">${html}</h1>`;
  }

  if (type === "heading_2") {
    const html = renderRichText(block.heading_2?.rich_text);
    if (!html.trim()) return "";
    return `<h2 class="notion-heading notion-h2">${html}</h2>`;
  }

  if (type === "heading_3") {
    const html = renderRichText(block.heading_3?.rich_text);
    if (!html.trim()) return "";
    return `<h3 class="notion-heading notion-h3">${html}</h3>`;
  }

  if (type === "quote") {
    const html = renderRichText(block.quote?.rich_text);
    if (!html.trim()) return "";
    return `<blockquote class="notion-quote">${html}</blockquote>`;
  }

  if (type === "callout") {
    const html = renderRichText(block.callout?.rich_text);
    const icon = calloutIcon(block);
    const color = block.callout?.color ?? "default";
    const colorCls = color !== "default" ? ` notion-callout-${color.replace(/_/g, "-")}` : "";
    let inner = "";
    if (block.has_children && !shouldStop(options)) {
      const children = await fetchBlockChildren(notion, block.id);
      inner = await renderBlockList(notion, children, options);
    }
    return `<div class="notion-callout${colorCls}"><span class="notion-callout-icon">${icon}</span><div class="notion-callout-body">${html ? `<p class="notion-paragraph">${html}</p>` : ""}${inner}</div></div>`;
  }

  if (type === "toggle") {
    const html = renderRichText(block.toggle?.rich_text);
    let inner = "";
    if (block.has_children && !shouldStop(options)) {
      const children = await fetchBlockChildren(notion, block.id);
      inner = await renderBlockList(notion, children, options);
    }
    return `<details class="notion-toggle"><summary class="notion-toggle-summary">${html || "詳細"}</summary><div class="notion-toggle-body">${inner}</div></details>`;
  }

  if (type === "to_do") {
    const checked = Boolean(block.to_do?.checked);
    const html = renderRichText(block.to_do?.rich_text);
    return `<label class="notion-todo"><input type="checkbox" disabled ${checked ? "checked" : ""} /><span>${html}</span></label>`;
  }

  if (type === "code") {
    const text = (block.code?.rich_text ?? [])
      .map((rt: NotionRichText) => rt.plain_text ?? "")
      .join("");
    const language = block.code?.language ?? "";
    return `<pre class="notion-code"><code${language ? ` data-lang="${escapeAttr(String(language))}"` : ""}>${escapeHtml(text)}</code></pre>`;
  }

  if (type === "image") {
    const url =
      block.image?.external?.url ??
      block.image?.file?.url ??
      block.image?.file?.external?.url ??
      null;
    if (typeof url === "string" && url.trim()) {
      return `<figure class="notion-image"><img src="${escapeAttr(url)}" alt="image" loading="lazy" /></figure>`;
    }
    return "";
  }

  if (type === "bookmark") {
    const url = block.bookmark?.url;
    const caption = renderRichText(block.bookmark?.caption);
    if (url) {
      return `<a class="notion-bookmark" href="${escapeAttr(url)}" target="_blank" rel="noreferrer">${caption || escapeHtml(url)}</a>`;
    }
    return "";
  }

  if (type === "bulleted_list_item" || type === "numbered_list_item") {
    return renderListGroup([block], options, notion);
  }

  return "";
}

async function renderListGroup(
  blocks: any[],
  options: RenderOptions,
  notion: Client,
): Promise<string> {
  if (blocks.length === 0) return "";

  const type = blocks[0].type;
  const tag = type === "numbered_list_item" ? "ol" : "ul";
  const listClass =
    type === "numbered_list_item" ? "notion-list notion-ol" : "notion-list notion-ul";

  const items: string[] = [];
  for (const block of blocks) {
    if (!trackBlock(options)) break;
    const richKey = type === "numbered_list_item" ? "numbered_list_item" : "bulleted_list_item";
    const html = renderRichText(block[richKey]?.rich_text);
    let inner = "";
    if (block.has_children && !shouldStop(options)) {
      const children = await fetchBlockChildren(notion, block.id);
      inner = await renderBlockList(notion, children, options);
    }
    items.push(`<li class="notion-list-item">${html}${inner ? `<div class="notion-list-children">${inner}</div>` : ""}</li>`);
  }

  return `<${tag} class="${listClass}">${items.join("")}</${tag}>`;
}

async function renderBlockList(
  notion: Client,
  blocks: any[],
  options: RenderOptions,
): Promise<string> {
  const rendered: string[] = [];
  let i = 0;

  while (i < blocks.length) {
    if (shouldStop(options)) break;

    const block = blocks[i];
    const type = block.type;

    if (type === "bulleted_list_item" || type === "numbered_list_item") {
      const group: any[] = [];
      while (i < blocks.length && blocks[i].type === type) {
        group.push(blocks[i]);
        i += 1;
      }
      rendered.push(await renderListGroup(group, options, notion));
      continue;
    }

    rendered.push(await renderSingleBlock(notion, block, options));
    i += 1;
  }

  return rendered.filter(Boolean).join("");
}

export async function fetchPageMeta(notion: Client, pageId: string) {
  const page: any = await notion.pages.retrieve({ page_id: pageId });

  let title = "Untitled";
  for (const prop of Object.values<any>(page.properties ?? {})) {
    if (prop?.type === "title") {
      title = (prop.title ?? []).map((t: any) => t.plain_text ?? "").join("").trim() || title;
      break;
    }
  }

  const icon = page.icon;
  let pageIcon: string | null = null;
  if (icon?.type === "emoji") pageIcon = icon.emoji ?? null;
  if (icon?.type === "external") pageIcon = icon.external?.url ?? null;
  if (icon?.type === "file") pageIcon = icon.file?.url ?? null;

  return {
    title,
    icon: pageIcon,
    lastEditedTime: page.last_edited_time as string | undefined,
  };
}

export async function pageBlocksToHtml(
  notion: Client,
  pageId: string,
  options?: { maxBlocks?: number },
): Promise<{ html: string; plainText: string }> {
  const maxBlocks = options?.maxBlocks ?? 200;
  const blocks = await fetchBlockChildren(notion, pageId);
  const renderOpts: RenderOptions = { maxBlocks, fetched: { count: 0 } };
  const html = await renderBlockList(notion, blocks, renderOpts);

  const plainParts = blocks
    .slice(0, maxBlocks)
    .map((b) => {
      const type = b.type;
      const key = b[type]?.rich_text;
      if (key) return richTextToPlainText(key);
      return "";
    })
    .filter(Boolean);

  return { html, plainText: plainParts.join("\n") };
}
