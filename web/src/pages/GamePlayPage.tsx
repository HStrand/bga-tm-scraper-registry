import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ALL_MAPS } from '@/data/mapHexes';
import { engineApi, type EngineApi } from '@/lib/engine/client';
import { engineGameInfo, engineSnapshot, hexKeyAt, seatId } from '@/lib/engine/engineAdapter';
import { hexPlacementCost } from '@/lib/engine/payment';
import { currentPrompt, type HexPrompt } from '@/lib/engine/prompts';
import type { ImportIssue, MoveBody } from '@/lib/engine/types';
import { useEngineGame } from '@/lib/engine/useEngineGame';
import { GlobalParamsBar } from '@/components/replay/GlobalParamsBar';
import { PlayerCard } from '@/components/replay/PlayerCard';
import { ReplayMap } from '@/components/replay/ReplayMap';
import { ActionMenu } from '@/components/play/ActionMenu';
import { PlayButton } from '@/components/play/controls';
import { MoveList } from '@/components/play/MoveList';
import { HeatSplitForm } from '@/components/play/PaymentForm';
import { PromptView } from '@/components/play/PromptView';

/**
 * A game on the engine, played hot-seat: every hand is visible and whoever is at the keyboard moves for
 * each player in turn. Reached from a replay's "Play from here".
 */
export function GamePlayPage({ api = engineApi }: { api?: EngineApi }) {
  const { gameId } = useParams<{ gameId: string }>();
  const importIssues = (useLocation().state as { issues?: ImportIssue[] } | null)?.issues ?? [];
  const game = useEngineGame(gameId, api);
  const { table } = game;

  const [showIssues, setShowIssues] = useState(true);
  const [chosenSeat, setChosenSeat] = useState<number | null>(null);
  // A hex the player asked to choose (a standard project, a plant conversion), as opposed to one the game demands.
  const [requestedHex, setRequestedHex] = useState<HexPrompt | null>(null);
  // A move on a chosen hex that is waiting for Helion to say how much of its cost to pay with heat.
  const [heatSplit, setHeatSplit] = useState<{ title: string; cost: number; move: MoveBody } | null>(null);
  const [expandedPlayerIds, setExpandedPlayerIds] = useState<Set<string>>(new Set());
  const collapseTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const moveNumber = table?.state.moveNumber;
  useEffect(() => {
    setRequestedHex(null);
    setHeatSplit(null);
  }, [moveNumber]);

  const info = useMemo(() => table ? engineGameInfo(table) : null, [table]);
  const snapshot = useMemo(() => table ? engineSnapshot(table) : null, [table]);

  const expandPlayer = useCallback((id: string) => {
    clearTimeout(collapseTimeouts.current.get(id));
    collapseTimeouts.current.delete(id);
    setExpandedPlayerIds(prev => prev.has(id) ? prev : new Set(prev).add(id));
  }, []);

  const collapsePlayer = useCallback((id: string) => {
    collapseTimeouts.current.set(id, setTimeout(() => {
      collapseTimeouts.current.delete(id);
      setExpandedPlayerIds(prev => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 150));
  }, []);

  if (game.loading) {
    return (
      <div className="flex items-center gap-2 text-slate-400 py-8">
        <div className="w-5 h-5 border-2 border-slate-600 border-t-amber-500 rounded-full animate-spin" />
        Loading game...
      </div>
    );
  }

  if (!table || !info || !snapshot) {
    return (
      <div className="bg-red-900/20 border border-red-800/40 rounded-lg p-4 text-red-300">
        <p className="font-medium">{game.error ?? 'Game not found.'}</p>
      </div>
    );
  }

  const { state } = table;
  const mapDefinition = ALL_MAPS.find(m => m.dbName === state.map);
  const playerNames = Object.fromEntries(info.players.map(p => [Number(p.id), p.name]));

  // In the action phase one player acts; in the draft and when buying cards several can, in any order.
  const actingSeats = Object.keys(table.legalMoves).map(Number).sort((a, b) => a - b);
  const seat = chosenSeat != null && actingSeats.includes(chosenSeat) ? chosenSeat : actingSeats[0] ?? null;
  const moves = seat != null ? table.legalMoves[seat] : null;
  const player = seat != null ? state.players.find(p => p.playerId === seat) ?? null : null;
  const prompt = moves && player ? currentPrompt(moves, player) : null;
  const hexPrompt = prompt?.kind === 'hex' ? prompt : requestedHex;
  // What the player can put towards a cost in M€; more than their M€ when they may pay with heat (Helion).
  const spendable = player
    ? table.players.find(p => p.playerId === player.playerId)?.spendableMegaCredits ?? player.resources.megaCredits
    : 0;

  const submit = (move: MoveBody) => {
    if (seat != null) void game.submit(seat, move);
  };

  const canPayWithHeat = player != null && spendable > player.resources.megaCredits && player.resources.heat > 0;

  const selection = hexPrompt && seat != null && !game.busy && !heatSplit ? {
    hexKeys: new Set(hexPrompt.locations.map(l => hexKeyAt(state.map, l.col, l.row))),
    onSelect: (hexKey: string) => {
      const location = hexPrompt.locations.find(l => hexKeyAt(state.map, l.col, l.row) === hexKey);
      if (!location) return;

      const move = hexPrompt.move(location);
      const cost = (hexPrompt.fixedCost ?? 0) + (hexPrompt.hexIsFree ? 0 : hexPlacementCost(state.map, location));
      if (canPayWithHeat && cost > 0) setHeatSplit({ title: hexPrompt.title, cost, move });
      else submit(move);
    },
  } : undefined;

  const source = table.meta?.source;
  const actor = info.players.find(p => p.id === (seat != null ? seatId(seat) : undefined));

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-white tracking-tight glow-white">
          {source?.tableId ? `Playing on from table ${source.tableId}` : 'Game'}
          {mapDefinition && <span className="text-slate-400 font-normal" style={{ textShadow: 'none' }}> &mdash; {mapDefinition.name}</span>}
        </h1>
        {source?.tableId && (
          <p className="text-sm text-slate-400">
            Forked after move {source.moveNumber ?? source.moveIndex + 1} of the real game.{' '}
            <Link to={`/replay/${source.tableId}?move=${source.moveIndex + 1}`} className="text-amber-400 hover:text-amber-300">
              Back to the replay
            </Link>
          </p>
        )}
      </div>

      {showIssues && importIssues.length > 0 && (
        <div className="mb-4 bg-amber-900/20 border border-amber-800/40 rounded-lg px-3 py-2 text-sm text-amber-300">
          <p className="font-medium">This position may differ from the real game:</p>
          <ul className="list-disc list-inside mt-1 space-y-0.5">
            {importIssues.map((issue, i) => <li key={i}>{issue.message}</li>)}
          </ul>
          <button type="button" className="mt-1 text-xs text-amber-400 hover:text-amber-200" onClick={() => setShowIssues(false)}>Dismiss</button>
        </div>
      )}

      <div className="flex gap-4 overflow-x-clip">
        <div className="w-[320px] flex-shrink-0 space-y-3">
          {info.players.map(p => (
            <PlayerCard
              key={p.id}
              playerId={p.id}
              playerName={p.name}
              corporation={p.corporation ?? ''}
              color={p.color}
              elo={null}
              player={snapshot.players[p.id]}
              isStartingPlayer={snapshot.firstPlayerId === p.id}
              isExpanded={expandedPlayerIds.has(p.id)}
              onExpand={() => expandPlayer(p.id)}
              onCollapse={() => collapsePlayer(p.id)}
            />
          ))}
        </div>

        <div className="flex-1 min-w-0 flex flex-col items-center">
          <div style={{ width: '80%' }}>
            {mapDefinition ? (
              <ReplayMap mapDefinition={mapDefinition} info={info} snapshot={snapshot} selection={selection} />
            ) : (
              <div className="glass-panel rounded-xl p-8 text-center text-slate-400">
                Map &ldquo;{state.map}&rdquo; not available for visualization.
              </div>
            )}
          </div>
        </div>

        <div className="w-[380px] flex-shrink-0 space-y-3">
          <GlobalParamsBar snapshot={snapshot} />

          <div className="glass-panel rounded-xl p-4 space-y-3" aria-live="polite">
            {game.viewingPast ? (
              <>
                <p className="text-sm text-slate-300">
                  Looking back at move {state.moveNumber} of {table.latestMoveNumber}. Moves can only be made from the current position.
                </p>
                <PlayButton variant="primary" onClick={game.viewLatest}>Back to the current position</PlayButton>
              </>
            ) : state.phase === 'GameEnd' ? (
              <FinalScores players={info.players} scores={table.players} />
            ) : seat == null || !moves || !player ? (
              <p className="text-sm text-slate-400">Nobody can move in this position.</p>
            ) : (
              <>
                {actingSeats.length > 1 ? (
                  <div className="flex flex-wrap gap-2" role="tablist" aria-label="Player to move for">
                    {actingSeats.map(s => (
                      <button
                        key={s}
                        type="button"
                        role="tab"
                        aria-selected={s === seat}
                        onClick={() => setChosenSeat(s)}
                        className={`px-2.5 py-1 rounded-lg text-sm font-medium border transition-colors ${s === seat ? 'border-amber-400 text-white bg-white/10' : 'border-white/10 text-slate-400 hover:text-white'}`}
                      >
                        {playerNames[s]}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">
                    <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5" style={{ backgroundColor: actor?.color }} />
                    <span className="font-semibold text-white">{actor?.name}</span> to move
                    {player.actionsThisTurn > 0 && ' (second action)'}
                  </p>
                )}

                {heatSplit ? (
                  <HeatSplitForm
                    title={heatSplit.title}
                    cost={heatSplit.cost}
                    player={player}
                    busy={game.busy}
                    onConfirm={heat => submit({ ...heatSplit.move, heat })}
                    onCancel={() => setHeatSplit(null)}
                  />
                ) : requestedHex ? (
                  <div className="space-y-3">
                    <p className="text-base font-semibold text-white">{requestedHex.title}</p>
                    <p className="text-sm text-slate-300">Click one of the highlighted hexes on the board.</p>
                    <PlayButton disabled={game.busy} onClick={() => setRequestedHex(null)}>Cancel</PlayButton>
                  </div>
                ) : prompt ? (
                  <PromptView
                    key={`${state.moveNumber}-${seat}`}
                    prompt={prompt}
                    player={player}
                    spendable={spendable}
                    names={table.cardNames}
                    playerNames={playerNames}
                    busy={game.busy}
                    onMove={submit}
                  />
                ) : moves.actions ? (
                  <ActionMenu
                    key={`${state.moveNumber}-${seat}`}
                    actions={moves.actions}
                    player={player}
                    names={table.cardNames}
                    canPayWithHeat={canPayWithHeat}
                    busy={game.busy}
                    onMove={submit}
                    onChooseHex={setRequestedHex}
                  />
                ) : (
                  <p className="text-sm text-slate-400">This part of the game cannot be played here yet.</p>
                )}
              </>
            )}
            {game.error && <p role="alert" className="text-sm text-red-400">{game.error}</p>}
          </div>

          <MoveList
            history={game.history}
            cardNames={game.cardNames}
            players={info.players}
            currentMoveNumber={state.moveNumber}
            onView={game.viewAt}
          />
        </div>
      </div>
    </div>
  );
}

function FinalScores({ players, scores }: {
  players: { id: string; name: string; color: string }[];
  scores: { playerId: number; points: { total: number } }[];
}) {
  const ranked = [...scores].sort((a, b) => b.points.total - a.points.total);
  return (
    <div>
      <p className="text-base font-semibold text-amber-400 mb-2">Game over</p>
      <ol className="space-y-1">
        {ranked.map(score => {
          const player = players.find(p => p.id === String(score.playerId));
          return (
            <li key={score.playerId} className="flex items-center justify-between text-sm text-slate-200">
              <span>
                <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5" style={{ backgroundColor: player?.color }} />
                {player?.name}
              </span>
              <span className="font-bold text-white">{score.points.total} VP</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
