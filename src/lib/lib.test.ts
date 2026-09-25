import { describe, expect, it } from "vitest";
import { parseDecision } from "@/lib/commands";
import { parseNewsRss, verifyFlag } from "@/lib/news";
import { chunkText } from "@/lib/telegram";
import { splitDraft } from "@/lib/pipeline";

const rss = `<rss><channel><item><title>Niacinamide study &amp; pH - Cosmetics Design</title><link>https://example.com/a</link>
<pubDate>Tue, 12 Aug 2026 08:00:00 GMT</pubDate><source url="x">Cosmetics Design</source></item></channel></rss>`;

describe("parseDecision", () => {
  it("reads APPROVE and REJECT loosely", () => {
    expect(parseDecision("APPROVE")).toBe("approved");
    expect(parseDecision(" reject. ")).toBe("rejected");
    expect(parseDecision("/approve")).toBe("approved");
  });
  it("treats notes as notes", () => {
    expect(parseDecision("I approve of this serum formulation")).toBeNull();
  });
});

describe("news", () => {
  it("parses the top RSS item", () => {
    const n = parseNewsRss(rss)!;
    expect(n.headline).toBe("Niacinamide study & pH");
    expect(n.source).toBe("Cosmetics Design");
    expect(n.date).toBe("2026-08-12");
  });
  it("returns null with no items", () => expect(parseNewsRss("<rss></rss>")).toBeNull());
  it("verify flag has every required line", () => {
    const f = verifyFlag(parseNewsRss(rss)!);
    for (const s of ["NEWS SOURCE:", "FROM:", "LINK:", "you are the author of this claim"]) expect(f).toContain(s);
  });
});

describe("draft assembly", () => {
  const news = parseNewsRss(rss)!;
  it("appends the verify flag only when news was used", () => {
    expect(splitDraft("Post text\nUSED_NEWS: yes", news).body).toContain("NEWS SOURCE:");
    expect(splitDraft("Post text\nUSED_NEWS: no", news).body).not.toContain("NEWS SOURCE:");
    expect(splitDraft("Post text\nUSED_NEWS: yes", null).body).not.toContain("NEWS SOURCE:");
  });
  it("strips the marker line", () => expect(splitDraft("Post text\nUSED_NEWS: no", news).body).toBe("Post text"));
});

describe("chunkText", () => {
  it("splits long text under the limit", () => {
    const parts = chunkText(("word ".repeat(300) + "\n\n").repeat(6), 1000);
    expect(parts.every((p) => p.length <= 1000)).toBe(true);
    expect(parts.length).toBeGreaterThan(1);
  });
});
