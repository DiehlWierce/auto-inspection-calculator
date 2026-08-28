export function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mix(hash: number, value: number): number {
  const next = hash ^ Math.imul(Math.round(value * 1000) | 0, 2654435761);
  return Math.imul(next ^ (next >>> 13), 1597334677) >>> 0;
}

function mixText(hash: number, text: string): number {
  let next = hash;
  for (let index = 0; index < text.length; index += 1) {
    next ^= text.charCodeAt(index);
    next = Math.imul(next, 16777619) >>> 0;
  }
  return next;
}

export function cheapEventsHash(events: Array<{ id: string; category: string; probability5y: number; repairCost: number; coefficient: number; maxCost: number; monthStart: number; monthEnd: number; mode?: string; scheduledMonth?: number; recurrenceMonths?: number }>, extra: number[], text: string[]): number {
  let hash = 2166136261;
  for (const event of events) {
    hash = mixText(hash, event.id);
    hash = mixText(hash, event.category);
    hash = mix(hash, event.probability5y);
    hash = mix(hash, event.repairCost);
    hash = mix(hash, event.coefficient);
    hash = mix(hash, event.maxCost);
    hash = mix(hash, event.monthStart);
    hash = mix(hash, event.monthEnd);
    hash = mix(hash, event.scheduledMonth ?? 0);
    hash = mix(hash, event.recurrenceMonths ?? 0);
    hash = mixText(hash, event.mode ?? 'RISK');
  }
  for (const value of extra) hash = mix(hash, value);
  for (const value of text) hash = mixText(hash, value);
  return hash >>> 0;
}
