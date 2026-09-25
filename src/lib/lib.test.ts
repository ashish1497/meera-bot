import { describe, expect, it } from "vitest";
import { parseDecision } from "@/lib/commands";
import { parseNewsRss, verifyFlag } from "@/lib/news";
import { chunkText } from "@/lib/telegram";
import { splitDraft, composeDraft } from "@/lib/pipeline";
import { lintPost, lintIssues } from "@/lib/structure";

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
  it("splits off the marker and parses usedNews", () => {
    expect(splitDraft("Post text\nUSED_NEWS: yes", news)).toEqual({ body: "Post text", usedNews: true });
    expect(splitDraft("Post text\nUSED_NEWS: no", news).usedNews).toBe(false);
    expect(splitDraft("Post text\nUSED_NEWS: yes", null).usedNews).toBe(false);
  });
  it("appends the verify flag only when news was used", () => {
    expect(composeDraft("Post", true, news)).toContain("NEWS SOURCE:");
    expect(composeDraft("Post", false, news)).toBe("Post");
    expect(composeDraft("Post", true, null)).toBe("Post");
  });
});

describe("structure lint (Session 2 rules)", () => {
  const good = `Batch 14 came back 0.4 pH units off.\n\nThe supplier changed the preservative. Nobody told us.\n\nWe held the batch. The texture had shifted.\n\nSame formula does not mean same formula.`;
  it("passes a clean post", () => expect(lintIssues(lintPost(good))).toEqual([]));
  it("flags long sentences, adverbs, question hook and question ending", () => {
    const bad = `Did you know suppliers quietly change blends?\n\nThe supplier really changed the preservative blend in a way that nobody on the team had noticed for months.\n\nWe held it.\n\nWhat do you think?`;
    const l = lintPost(bad);
    expect(l.longSentences.length).toBe(1);
    expect(l.adverbs).toContain("really");
    expect(l.hookProblems.join()).toMatch(/question/);
    expect(l.endingProblems.join()).toMatch(/question/);
    expect(l.banned).toContain("what do you think");
  });
  it("flags paragraphs over 3 mobile rows", () => {
    expect(lintPost(`${"Short one. ".repeat(30)}\n\nb\n\nc`).longParagraphs.length).toBe(1);
  });
  it("does not flag common -ly words", () => expect(lintPost("Only the family supply is likely daily.\n\nb\n\nc").adverbs).toEqual([]));
});

describe("chunkText", () => {
  it("splits long text under the limit", () => {
    const parts = chunkText(("word ".repeat(300) + "\n\n").repeat(6), 1000);
    expect(parts.every((p) => p.length <= 1000)).toBe(true);
    expect(parts.length).toBeGreaterThan(1);
  });
});
