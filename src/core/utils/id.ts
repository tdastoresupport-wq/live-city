/**
 * Simple unique ID generator.
 */
let counter = 0;
export function generateId(prefix = 'id'): string {
  counter++;
  return `${prefix}_${Date.now()}_${counter}_${Math.random().toString(36).substring(2, 7)}`;
}

/**
 * Deterministic color generation based on user name/id.
 */
const AVATAR_COLORS = [
  '#f87171', // red
  '#fb923c', // orange
  '#fbbf24', // amber
  '#34d399', // emerald
  '#22d3ee', // cyan
  '#60a5fa', // blue
  '#818cf8', // indigo
  '#a78bfa', // violet
  '#f472b6', // pink
  '#38bdf8', // sky
];

export function getAvatarColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash << 5) - hash + userId.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}
