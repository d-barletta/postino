import type { EntityGraphNodeCategory } from '@/types';

export const CATEGORY_COLORS: Record<EntityGraphNodeCategory, string> = {
  topics: '#818cf8', // indigo-400
  people: '#4ade80', // green-400
  organizations: '#fb923c', // orange-400
  places: '#38bdf8', // sky-400
  events: '#f9a8d4', // pink-300
  dates: '#fde047', // yellow-300
  numbers: '#f87171', // red-400
  prices: '#92400e', // brown (amber-800)
};
