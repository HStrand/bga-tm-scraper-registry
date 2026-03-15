export interface CombinationBaselineRow {
  name: string;
  gameCount: number;
  avgEloChange: number;
  winRate: number;
}

export interface CombinationComboRow {
  name1: string;
  name2: string;
  gameCount: number;
  avgEloChange: number;
  winRate: number;
}

export interface CombinationBaselines {
  cards: CombinationBaselineRow[];
  corporations: CombinationBaselineRow[];
  preludes: CombinationBaselineRow[];
}

export type ComboType = 'corp-prelude' | 'corp-card' | 'prelude-prelude' | 'prelude-card' | 'card-card';
