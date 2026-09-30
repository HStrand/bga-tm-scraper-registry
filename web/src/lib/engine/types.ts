// JSON shapes of the tm-engine API (C:\Code\tm-engine). The engine identifies players by seat number and
// cards by id; names come from the cardNames map in each response and from the import metadata.

export interface HexCoord {
  col: number;
  row: number;
}

export interface EngineResources {
  megaCredits: number;
  steel: number;
  titanium: number;
  plants: number;
  energy: number;
  heat: number;
}

export interface EnginePlayer {
  playerId: number;
  corporationId: string;
  terraformRating: number;
  resources: EngineResources;
  production: EngineResources;
  hand: string[];
  /** Preludes and non-event project cards. */
  playedCards: string[];
  playedEvents: string[];
  cardResources: Record<string, number>;
  usedCardActions: string[];
  passed: boolean;
  actionsThisTurn: number;
}

export type EnginePhase =
  | 'Setup' | 'PreludePlacement' | 'Research' | 'Action' | 'Production' | 'FinalGreeneryConversion' | 'GameEnd';

export interface EngineTile {
  /** "Ocean", "Greenery", "City", or a special tile such as "NuclearZone". */
  type: string;
  ownerId?: number | null;
  location: HexCoord;
}

export interface EngineState {
  gameId: string;
  map: string;
  corporateEra: boolean;
  draftVariant: boolean;
  preludeExpansion: boolean;
  moveNumber: number;
  phase: EnginePhase;
  generation: number;
  activePlayerId: number;
  firstPlayerId: number;
  oxygen: number;
  temperature: number;
  oceansPlaced: number;
  players: EnginePlayer[];
  /** Keyed by "col,row". */
  placedTiles: Record<string, EngineTile>;
  offMapTiles: { name: string; type: string; ownerId: number }[];
  claimedHexes: Record<string, number>;
  claimedMilestones: { milestoneName: string; playerId: number }[];
  fundedAwards: { awardName: string; playerId: number }[];
  pendingAction?: PendingAction | null;
  lastMove?: EngineMove | null;
}

// ── Moves ────────────────────────────────────────────────────

export interface Payment {
  megaCredits: number;
  steel: number;
  titanium: number;
  heat: number;
  /** Card id -> resources spent from that card (e.g. Psychrophiles microbes). */
  cardResources?: Record<string, number> | null;
}

/** A move before the seat making it is filled in. */
export type MoveBody = MoveKind & {
  /**
   * Heat to spend in place of M€ on the move's M€ cost, for moves with no other payment (standard projects,
   * milestones, awards, buying cards, M€ card actions). Helion only. Left out, the engine spends M€ first.
   */
  heat?: number;
};

type MoveKind =
  | { type: 'DraftCard'; cardId: string }
  | { type: 'BuyCards'; cardIds: string[] }
  | { type: 'PlayCard'; cardId: string; payment: Payment }
  | { type: 'SellPatents'; cardIds: string[] }
  | { type: 'PowerPlant' | 'Asteroid' | 'ConvertHeat' | 'Pass' | 'EndTurn' | 'PerformFirstAction' }
  | { type: 'Aquifer' | 'Greenery' | 'City' | 'ConvertPlants' | 'PlaceTile'; location: HexCoord }
  | { type: 'UseCardAction'; cardId: string; payment?: Payment | null }
  | { type: 'ClaimMilestone'; milestoneName: string }
  | { type: 'FundAward'; awardName: string }
  | { type: 'PlayPrelude'; preludeId: string }
  | { type: 'ChooseTargetPlayer'; targetPlayerId: number }
  | { type: 'SelectCard'; cardId: string }
  | { type: 'ChooseOption'; optionIndex: number }
  | { type: 'DiscardCards'; cardIds: string[] }
  | { type: 'ChooseEffectOrder'; effectIndex: number };

export type EngineMove = MoveBody & { playerId: number };

// ── Legal moves ──────────────────────────────────────────────

export interface PlayableCard {
  cardId: string;
  effectiveCost: number;
  canUseSteel: boolean;
  canUseTitanium: boolean;
  canUseHeat: boolean;
  steelValue: number;
  titaniumValue: number;
  /** Card id -> MC value of each resource on it that may be spent on this card. */
  cardResourcePayments: Record<string, number>;
}

export type StandardProject = 'SellPatents' | 'PowerPlant' | 'Asteroid' | 'Aquifer' | 'Greenery' | 'City';

export interface StandardProjectOption {
  project: StandardProject;
  available: boolean;
  cost: number;
  validLocations?: HexCoord[] | null;
}

export interface UsableCardAction {
  cardId: string;
  allowSteel: boolean;
  allowTitanium: boolean;
  canUseHeat: boolean;
  mcCost: number;
  steelValue: number;
  titaniumValue: number;
}

export interface ActionPhaseOptions {
  canPass: boolean;
  canEndTurn: boolean;
  canConvertHeat: boolean;
  canConvertPlants: boolean;
  plantConversionCost: number;
  validGreeneryLocations: HexCoord[];
  canPerformFirstAction: boolean;
  playableCards: PlayableCard[];
  standardProjects: StandardProjectOption[];
  claimableMilestones: { name: string }[];
  fundableAwards: { name: string; cost: number }[];
  usableCardActions: UsableCardAction[];
}

export type PendingAction =
  | { type: 'PlaceTile'; tileType: string; validLocations: HexCoord[] }
  | { type: 'ClaimLand'; validLocations: HexCoord[] }
  | { type: 'RemoveResource'; resource: string; amount: number; validTargetPlayerIds: number[]; isOptional: boolean }
  | { type: 'ReduceProduction'; resource: string; amount: number; validTargetPlayerIds: number[] }
  | { type: 'AddCardResource' | 'RemoveCardResource'; resourceType: string; amount: number; validCardIds: string[] }
  | { type: 'CopyProduction'; validCardIds: string[] }
  | { type: 'ChooseCardToPlay'; description: string; cardIds: string[] }
  | { type: 'DrawKeep'; drawnCardIds: string[]; keepCount: number; costPerCard: number }
  | { type: 'BuyCards'; availableCardIds: string[] }
  | { type: 'DiscardCards'; count: number }
  | { type: 'MarsUniversity' }
  | { type: 'PlayCardFromHand'; description: string; ignoreGlobalRequirements: boolean; costDiscount: number }
  | { type: 'ChooseOption'; description: string; options: string[]; sourceCardId?: string | null; validOptionIndices?: number[] | null }
  | { type: 'ChooseEffectOrder'; sourceCardId: string; effectSource: string; remainingEffectIndices: number[]; effectDescriptions: string[] }
  | { type: 'ChooseTriggerOrder'; descriptions: string[] };

/** What one player may do now. At most one of the phase-specific fields is set. */
export interface AvailableMoves {
  gameOver: boolean;
  waitingForOtherPlayer: boolean;
  draft?: { draftHand: string[]; passingToPlayerId: number } | null;
  buyCards?: { availableCards: string[]; costPerCard: number } | null;
  pendingAction?: PendingAction | null;
  /** Cards playable in answer to a PlayCardFromHand pending action. */
  pendingPlayableCards: PlayableCard[];
  actions?: ActionPhaseOptions | null;
  finalGreenery?: { canConvert: boolean; canPass: boolean; validGreeneryLocations?: HexCoord[] | null } | null;
}

// ── Responses ────────────────────────────────────────────────

export interface PlayerStatus {
  playerId: number;
  corporation: string;
  points: { total: number; tr: number; vp: number; milestones: number; awards: number; greeneries: number; cities: number };
  tiles: { greeneries: number; cities: number; specialTiles: number };
  resources: EngineResources;
  production: EngineResources;
  tags: Record<
    'building' | 'space' | 'power' | 'science' | 'jovian' | 'earth' | 'plant' | 'microbe' | 'animal' | 'city' | 'event' | 'wild',
    number
  >;
  /** What the player can put towards a cost in M€: their M€, plus heat when they may pay with it (Helion). */
  spendableMegaCredits: number;
}

export interface SeatMeta {
  seat: number;
  bgaPlayerId: string;
  name: string;
  color?: string | null;
}

export interface GameMeta {
  seats: SeatMeta[];
  source: { tableId?: string | null; perspective?: string | null; moveIndex: number; moveNumber?: number | null };
  shuffleSeed: number;
}

/** The game as one person controlling every seat sees it. */
export interface TableResponse {
  state: EngineState;
  /** Card id -> name, for every card id in this response. */
  cardNames: Record<string, string>;
  players: PlayerStatus[];
  /** Seat -> legal moves, for the seats that can act. Empty when viewing a past move. */
  legalMoves: Record<string, AvailableMoves>;
  drawPileCount: number;
  discardPileCount: number;
  latestMoveNumber: number;
  meta?: GameMeta | null;
}

export interface HistoryEntry {
  moveNumber: number;
  generation: number;
  move: EngineMove;
}

// ── Import from a BGA replay ─────────────────────────────────

export interface ForkPoint {
  /** Index into the BGA game log's moves: the position is the one after this move. */
  moveIndex: number;
  moveNumber?: number | null;
  kind: 'GenerationStart' | 'ActionStart';
  generation: number;
  activeBgaPlayerId: string;
}

export interface ImportIssue {
  severity: 'Warning' | 'Blocking';
  code: string;
  message: string;
}

export interface ForkPointsResponse {
  eligible: boolean;
  forkPoints: ForkPoint[];
  issues: ImportIssue[];
}

export interface ImportResponse {
  gameId?: string | null;
  fork?: ForkPoint | null;
  meta?: GameMeta | null;
  issues: ImportIssue[];
}
