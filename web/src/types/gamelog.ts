export interface GameLog {
  replay_id: string;
  player_perspective: string;
  map: string;
  game_date: string;
  game_duration?: string;
  winner: string;
  generations: number | null;
  players: Record<string, GameLogPlayer>;
  moves: GameLogMove[];
}

export interface GameLogPlayer {
  player_id: string;
  player_name: string;
  corporation: string;
  final_vp: number | null;
  cards_played: string[];
  starting_hand?: {
    corporations?: string[] | null;
    preludes?: string[] | null;
    project_cards?: string[] | null;
  };
}

export interface GameLogMove {
  move_number: number | null;
  timestamp?: string;
  player_id: string;
  player_name: string;
  action_type: string;
  description: string;
  card_played?: string;
  card_cost?: number | null;
  card_drafted?: string;
  tile_placed?: string;
  tile_location?: string;
  cards_kept?: Record<string, string[]>;
  cards_sold?: string[] | null;
  hand?: string[] | null;
  game_state?: GameState;
}

export interface GameState {
  generation: number | null;
  temperature: number | null;
  oxygen: number | null;
  oceans: number | null;
  draw_pile?: number | null;
  discard_pile?: number | null;
  player_vp?: Record<string, PlayerVictoryPoints>;
}

export interface CardResource {
  type: string;
  count: number;
}

export interface PlayerVictoryPoints {
  total: number | null;
  total_details?: {
    tr?: number | null;
    awards?: number | null;
    milestones?: number | null;
    cities?: number | null;
    greeneries?: number | null;
    cards?: number | null;
  };
  details?: {
    card_resources?: Record<string, CardResource>;
    [key: string]: unknown;
  };
}
