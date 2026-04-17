export const NAME_POOL: readonly string[] = [
  "Alice", "Amara", "Bob", "Blake", "Carol", "Chen", "Dave", "Dmitri",
  "Eve", "Elena", "Frank", "Fatima", "Grace", "Gabriel", "Heidi", "Hana",
  "Ivan", "Indigo", "Judy", "Jax", "Karl", "Kai", "Liam", "Lena",
  "Mallory", "Milo", "Niaj", "Nadia", "Olivia", "Omar", "Peggy", "Priya",
  "Quentin", "Quinn", "Rupert", "Ravi", "Sybil", "Sora", "Trent", "Tariq",
  "Ursula", "Uma", "Victor", "Vera", "Wendy", "Wren", "Xander", "Xiomara",
  "Yves", "Yuki", "Zoe", "Zara",
] as const;

/**
 * Deterministic per-seed PRNG (mulberry32). Good enough for shuffling; we're
 * not doing crypto here. Same seed → same sequence, so tests and the same
 * session id pick the same ordering across runs.
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffledPool(seed: string): string[] {
  const rand = mulberry32(hashString(seed));
  const a = [...NAME_POOL];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface PickNameOptions {
  /**
   * Optional seed. When set, the pool is deterministically shuffled with this
   * seed before first-free selection — so different sessions pick different
   * opening names, but a given session always produces the same ordering.
   */
  seed?: string;
  /**
   * Optional preferred name. If provided and not in the taken set, returned
   * verbatim. Used for persistent_id-based reclaim.
   */
  prefer?: string;
}

export function pickName(taken: readonly string[], opts: PickNameOptions = {}): string {
  const held = new Set(taken);
  if (opts.prefer && !held.has(opts.prefer)) return opts.prefer;
  const order = opts.seed ? shuffledPool(opts.seed) : [...NAME_POOL];
  for (let suffix = 1; suffix < 1000; suffix++) {
    for (const base of order) {
      const candidate = suffix === 1 ? base : `${base}${suffix}`;
      if (!held.has(candidate)) return candidate;
    }
  }
  throw new Error("Too many agents in one session. Reduce concurrency.");
}
