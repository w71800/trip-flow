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
  };
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

function renderRichText(richText: NotionRichText[] | undefined): string {
  const parts = (richText ?? []).map((rt) => {
    const text = escapeHtml(rt.plain_text ?? "");
    const href = rt.href ?? null;

    const annotations = rt.annotations ?? {};
    let inner = text;
    if (annotations.code) inner = `<code>${inner}</code>`;
    if (annotations.bold) inner = `<strong>${inner}</strong>`;
    if (annotations.italic) inner = `<em>${inner}</em>`;
    if (annotations.underline) inner = `<u>${inner}</u>`;
    if (annotations.strikethrough) inner = `<s>${inner}</s>`;

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

export async function blocksToHtml(
  notionBlocks: any[],
  options?: { maxBlocks?: number },
): Promise<{ html: string; plainText: string }> {
  const maxBlocks = options?.maxBlocks ?? 12;
  const limited = notionBlocks.slice(0, maxBlocks);

  const rendered: string[] = [];
  const plainParts: string[] = [];

  for (const block of limited) {
    const type = block.type;

    if (type === "divider") {
      rendered.push(`<hr/>`);
      continue;
    }

    if (type === "paragraph") {
      const html = renderRichText(block.paragraph?.rich_text);
      if (html.trim()) rendered.push(`<p>${html}</p>`);
      const plain = richTextToPlainText(block.paragraph?.rich_text);
      if (plain.trim()) plainParts.push(plain.trim());
      continue;
    }

    if (type === "heading_1") {
      const html = renderRichText(block.heading_1?.rich_text);
      if (html.trim()) rendered.push(`<h3>${html}</h3>`);
      const plain = richTextToPlainText(block.heading_1?.rich_text);
      if (plain.trim()) plainParts.push(plain.trim());
      continue;
    }

    if (type === "heading_2") {
      const html = renderRichText(block.heading_2?.rich_text);
      if (html.trim()) rendered.push(`<h3>${html}</h3>`);
      const plain = richTextToPlainText(block.heading_2?.rich_text);
      if (plain.trim()) plainParts.push(plain.trim());
      continue;
    }

    if (type === "heading_3") {
      const html = renderRichText(block.heading_3?.rich_text);
      if (html.trim()) rendered.push(`<h3>${html}</h3>`);
      const plain = richTextToPlainText(block.heading_3?.rich_text);
      if (plain.trim()) plainParts.push(plain.trim());
      continue;
    }

    if (type === "bulleted_list_item") {
      const html = renderRichText(block.bulleted_list_item?.rich_text);
      if (html.trim()) rendered.push(`<ul><li>${html}</li></ul>`);
      const plain = richTextToPlainText(block.bulleted_list_item?.rich_text);
      if (plain.trim()) plainParts.push(`• ${plain.trim()}`);
      continue;
    }

    if (type === "numbered_list_item") {
      const html = renderRichText(block.numbered_list_item?.rich_text);
      if (html.trim()) rendered.push(`<ol><li>${html}</li></ol>`);
      const plain = richTextToPlainText(block.numbered_list_item?.rich_text);
      if (plain.trim()) plainParts.push(`${plain.trim()}`);
      continue;
    }

    if (type === "to_do") {
      const checked = Boolean(block.to_do?.checked);
      const html = renderRichText(block.to_do?.rich_text);
      if (html.trim())
        rendered.push(`<p><strong>[${checked ? "x" : " "}]</strong> ${html}</p>`);
      const plain = richTextToPlainText(block.to_do?.rich_text);
      if (plain.trim()) plainParts.push(`[${checked ? "x" : " "}] ${plain.trim()}`);
      continue;
    }

    if (type === "quote") {
      const html = renderRichText(block.quote?.rich_text);
      if (html.trim()) rendered.push(`<blockquote>${html}</blockquote>`);
      const plain = richTextToPlainText(block.quote?.rich_text);
      if (plain.trim()) plainParts.push(plain.trim());
      continue;
    }

    if (type === "code") {
      const text = (block.code?.rich_text ?? []).map((rt: NotionRichText) => rt.plain_text ?? "").join("");
      const language = block.code?.language ?? "";
      const safeText = escapeHtml(text ?? "");
      rendered.push(
        `<pre><code${language ? ` data-lang="${escapeAttr(String(language))}"` : ""}>${safeText}</code></pre>`,
      );
      if (text?.trim()) plainParts.push(text.trim());
      continue;
    }

    if (type === "image") {
      const url =
        block.image?.external?.url ??
        block.image?.file?.url ??
        block.image?.file?.external?.url ??
        null;
      if (typeof url === "string" && url.trim()) {
        rendered.push(
          `<p><img src="${escapeAttr(url)}" alt="image" style="max-width:100%; height:auto; border-radius:12px;" loading="lazy" /></p>`,
        );
      }
      continue;
    }
  }

  return { html: rendered.join(""), plainText: plainParts.join("\n") };
}

