export interface Tier {
  label: string;
  color: string;
  bg: string;
  border: string;
}

export const TIER_ORDER: Tier[] = [
  { label: 'S+', color: 'text-yellow-600 dark:text-yellow-300', bg: 'bg-yellow-50 dark:bg-yellow-900/30', border: 'border-yellow-400 dark:border-yellow-600' },
  { label: 'S',  color: 'text-amber-600 dark:text-amber-300',  bg: 'bg-amber-50 dark:bg-amber-900/30',  border: 'border-amber-400 dark:border-amber-600' },
  { label: 'A',  color: 'text-green-600 dark:text-green-400',  bg: 'bg-green-50 dark:bg-green-900/30',  border: 'border-green-400 dark:border-green-600' },
  { label: 'B',  color: 'text-teal-600 dark:text-teal-400',    bg: 'bg-teal-50 dark:bg-teal-900/30',    border: 'border-teal-400 dark:border-teal-600' },
  { label: 'C',  color: 'text-blue-600 dark:text-blue-400',    bg: 'bg-blue-50 dark:bg-blue-900/30',    border: 'border-blue-400 dark:border-blue-600' },
  { label: 'D',  color: 'text-orange-600 dark:text-orange-400',bg: 'bg-orange-50 dark:bg-orange-900/30',border: 'border-orange-400 dark:border-orange-600' },
  { label: 'E',  color: 'text-red-500 dark:text-red-400',      bg: 'bg-red-50 dark:bg-red-900/30',      border: 'border-red-400 dark:border-red-600' },
  { label: 'F',  color: 'text-red-700 dark:text-red-500',      bg: 'bg-red-100 dark:bg-red-900/40',     border: 'border-red-500 dark:border-red-700' },
  { label: 'F-', color: 'text-red-900 dark:text-red-400',      bg: 'bg-red-200 dark:bg-red-900/50',     border: 'border-red-700 dark:border-red-800' },
];

const UNKNOWN_TIER: Tier = {
  label: '?',
  color: 'text-slate-500',
  bg: 'bg-slate-100 dark:bg-slate-700',
  border: 'border-slate-300 dark:border-slate-600',
};

export function getTier(avgEloChangeKept: number | null): Tier {
  if (avgEloChangeKept == null) return UNKNOWN_TIER;
  if (avgEloChangeKept > 1.75) return TIER_ORDER[0];
  if (avgEloChangeKept > 1.25) return TIER_ORDER[1];
  if (avgEloChangeKept > 0.75) return TIER_ORDER[2];
  if (avgEloChangeKept > 0.25) return TIER_ORDER[3];
  if (avgEloChangeKept >= -0.25) return TIER_ORDER[4];
  if (avgEloChangeKept >= -0.75) return TIER_ORDER[5];
  if (avgEloChangeKept >= -1.25) return TIER_ORDER[6];
  if (avgEloChangeKept >= -1.75) return TIER_ORDER[7];
  return TIER_ORDER[8];
}
