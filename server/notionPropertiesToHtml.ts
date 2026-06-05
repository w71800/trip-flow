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

function richTextToPlain(richText: any[] | undefined): string {
  return (richText ?? []).map((t) => t.plain_text ?? "").join("").trim();
}

export function propertiesToHtml(
  properties: Record<string, any>,
  options?: { skip?: string[] },
): string {
  const skip = new Set(options?.skip ?? []);
  const parts: string[] = [];

  for (const [name, prop] of Object.entries(properties)) {
    if (skip.has(name) || !prop) continue;

    if (prop.type === "title") continue;

    if (prop.type === "date" && prop.date?.start) {
      const start = prop.date.start;
      const end = prop.date.end ? ` ~ ${prop.date.end}` : "";
      parts.push(`<p><strong>${escapeHtml(name)}：</strong>${escapeHtml(`${start}${end}`)}</p>`);
      continue;
    }

    if (prop.type === "rich_text") {
      const text = richTextToPlain(prop.rich_text);
      if (text) parts.push(`<p><strong>${escapeHtml(name)}：</strong>${escapeHtml(text)}</p>`);
      continue;
    }

    if (prop.type === "select" && prop.select?.name) {
      parts.push(
        `<p><strong>${escapeHtml(name)}：</strong>${escapeHtml(prop.select.name)}</p>`,
      );
      continue;
    }

    if (prop.type === "multi_select" && prop.multi_select?.length) {
      const values = prop.multi_select.map((s: any) => s.name).filter(Boolean).join("、");
      if (values) {
        parts.push(`<p><strong>${escapeHtml(name)}：</strong>${escapeHtml(values)}</p>`);
      }
      continue;
    }

    if (prop.type === "url" && prop.url) {
      const safeUrl = escapeHtml(prop.url);
      parts.push(
        `<p><strong>${escapeHtml(name)}：</strong><a href="${safeUrl}" target="_blank" rel="noreferrer">${safeUrl}</a></p>`,
      );
      continue;
    }

    if (prop.type === "relation") continue;
  }

  return parts.join("");
}
