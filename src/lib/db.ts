import postgres from "postgres";

let client: ReturnType<typeof postgres> | null = null;

export function sql() {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set.");
    // Transaction-mode pooler (port 6543) does not support prepared statements.
    client = postgres(url, { prepare: false, max: 1, ssl: "require" });
  }
  return client;
}
