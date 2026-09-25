export type Decision = "approved" | "rejected";

/** APPROVE / REJECT (case-insensitive, optional trailing punctuation). Anything else is a note. */
export function parseDecision(text: string): Decision | null {
  const t = text.trim().toLowerCase().replace(/[.!\s]+$/g, "");
  if (t === "approve" || t === "/approve") return "approved";
  if (t === "reject" || t === "/reject") return "rejected";
  return null;
}
