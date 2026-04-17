export const NAME_POOL: readonly string[] = [
  "Alice", "Bob", "Carol", "Dave", "Eve", "Frank", "Grace", "Heidi",
  "Ivan", "Judy", "Karl", "Liam", "Mallory", "Niaj", "Olivia", "Peggy",
  "Quentin", "Rupert", "Sybil", "Trent", "Ursula", "Victor", "Wendy",
  "Xander", "Yves", "Zoe",
] as const;

export function pickName(taken: readonly string[]): string {
  const held = new Set(taken);
  for (let suffix = 1; suffix < 1000; suffix++) {
    for (const base of NAME_POOL) {
      const candidate = suffix === 1 ? base : `${base}${suffix}`;
      if (!held.has(candidate)) return candidate;
    }
  }
  throw new Error("Too many agents in one session (>25,974). Reduce concurrency.");
}
