export type NewsItem = { headline: string; source: string; date: string; url: string; summary: string };

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

function strip(s: string): string {
  return decode(s).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? m[1] : "";
}

export function parseNewsRss(xml: string): NewsItem | null {
  const item = xml.match(/<item>([\s\S]*?)<\/item>/);
  if (!item) return null;
  const block = item[1];
  const rawTitle = strip(tag(block, "title"));
  const source = strip(tag(block, "source"));
  // Google News titles end with " - Publisher"
  const headline = source && rawTitle.endsWith(` - ${source}`) ? rawTitle.slice(0, -(source.length + 3)) : rawTitle;
  const url = strip(tag(block, "link"));
  const pub = strip(tag(block, "pubDate"));
  const date = pub ? new Date(pub).toISOString().slice(0, 10) : "";
  const desc = strip(tag(block, "description"));
  // Google's description is usually the headline repeated with the publisher; drop it if so.
  const summary = desc && !desc.startsWith(headline.slice(0, 30)) ? desc : headline;
  if (!headline || !url) return null;
  return { headline, source: source || "Google News", date, url, summary };
}

export async function fetchTopNews(query: string): Promise<NewsItem | null> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (meera-bot)" }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return null;
  return parseNewsRss(await res.text());
}

export function verifyFlag(n: NewsItem): string {
  return [
    "─────────────────────────────────",
    `NEWS SOURCE: ${n.headline}`,
    `FROM: ${n.source} · ${n.date}`,
    `LINK: ${n.url}`,
    "⚠ Check this before publishing — you are the author of this claim",
    "─────────────────────────────────",
  ].join("\n");
}
