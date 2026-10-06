import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ALL_MAPS } from '@/data/mapHexes';
import { engineApi, type EngineApi } from '@/lib/engine/client';
import { engineGameInfo, engineSnapshot, hexKeyAt, seatId } from '@/lib/engine/engineAdapter';
import { hexPlacementCost } from '@/lib/engine/payment';
import { currentPrompt } from '@/lib/engine/prompts';
import { startingPosition } from '@/lib/engine/startLink';
import type { EnginePlayer, EngineState, ImportIssue, MoveBody, PlayableCard } from '@/lib/engine/types';
import { useEngineGame } from '@/lib/engine/useEngineGame';
import { playSound } from '@/lib/sfx';
import { engineMoveSounds, playSounds } from '@/lib/sfxEvents';
import { SoundToggle } from '@/components/SoundToggle';
import { EndGameSummary, type PlayerSummary } from '@/components/replay/EndGameSummary';
import { ReplayMap } from '@/components/replay/ReplayMap';
import { MILESTONE_COST, playActions, type Flow } from '@/components/play/actions';
import { CardPicker, Dialog, PlayButton, cardImage } from '@/components/play/controls';
import { CardDrawBurst } from '@/components/play/CardDrawBurst';
import { CardResourceBurst, diffCardResources, type CardResourceChange } from '@/components/play/CardResourceBurst';
import { Decision } from '@/components/play/Decision';
import { Hand } from '@/components/play/Hand';
import { MoveFeed } from '@/components/play/MoveFeed';
import { HeatSplitForm, PaymentForm } from '@/components/play/PaymentForm';
import { PlayerPanel } from '@/components/play/PlayerPanel';
import { ShareStart } from '@/components/play/ShareStart';
import { ActionPanels } from '@/components/play/ActionPanels';
import { TopBar } from '@/components/play/TopBar';

/** Room kept under the board for the quick actions and the tops of the hand cards. */
const HAND_AREA = 170;
/** Width of the two side columns with their gaps, which the hand must stay clear of. */
const SIDE_COLUMNS = 680;

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
  // The score breakdown opens by itself when the game ends, and can be closed to look at the final board.
  const [showScores, setShowScores] = useState(true);
  const [chosenSeat, setChosenSeat] = useState<number | null>(null);
  // Something the player has started that needs one more answer: a payment, a hex, which patents to sell.
  const [flow, setFlow] = useState<Flow | null>(null);

  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const moveNumber = table?.state.moveNumber;
  useEffect(() => setFlow(null), [moveNumber, game.viewingPast]);

  // Cards that gained or lost resources in the move just made, shown for a moment over the board.
  const [burst, setBurst] = useState<{ key: number; changes: CardResourceChange[] } | null>(null);
  const positionBefore = useRef<EngineState | null>(null);
  useEffect(() => {
    const before = positionBefore.current;
    // Looking back through the game is not a move: forget where we were, so returning shows nothing.
    positionBefore.current = table && !game.viewingPast ? table.state : null;
    if (!table || !before || game.viewingPast || table.state.moveNumber <= before.moveNumber) return;
    const changes = diffCardResources(before.players, table.state.players);
    if (changes.length > 0) setBurst({ key: table.state.moveNumber, changes });
    playSounds(engineMoveSounds(before, table.state, game.draw?.moveNumber === table.state.moveNumber));
  }, [table, game.viewingPast, game.draw]);

  // A refused move gets a low buzz; the message under the actions says why.
  useEffect(() => {
    if (game.error && table) playSound('bad');
  }, [game.error, table]);

  // The last card of a draft round is no choice: whoever is left holding one card takes it without being asked.
  useEffect(() => {
    if (!table || !gameId || game.busy || game.viewingPast || game.error) return;
    const forced = Object.entries(table.legalMoves).find(([, m]) => m.draft?.draftHand.length === 1);
    if (forced) void game.submit(Number(forced[0]), { type: 'DraftCard', cardId: forced[1].draft!.draftHand[0] });
  }, [table, gameId, game]);

  const info = useMemo(() => table ? engineGameInfo(table) : null, [table]);
  const snapshot = useMemo(() => table ? engineSnapshot(table) : null, [table]);

  if (game.loading) {
    return (
      <div className="flex h-screen items-center justify-center gap-2 text-slate-400">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-600 border-t-amber-500" />
        Loading game...
      </div>
    );
  }

  if (!table || !info || !snapshot) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="rounded-lg border border-red-800/40 bg-red-900/20 p-4 font-medium text-red-300">{game.error ?? 'Game not found.'}</p>
      </div>
    );
  }

  const { state } = table;
  const mapDefinition = ALL_MAPS.find(m => m.dbName === state.map);
  const playerNames = Object.fromEntries(info.players.map(p => [Number(p.id), p.name]));
  const gameOver = state.phase === 'GameEnd';

  // Best score first; a tie goes to whoever has more M€ left.
  const standings: PlayerSummary[] = info.players
    .map(p => ({
      playerId: p.id,
      playerName: p.name,
      color: p.color,
      corporation: p.corporation ?? '',
      vp: snapshot.players[p.id].vp,
      finalVp: null,
      mcRemaining: snapshot.players[p.id].resources.mc,
    }))
    .sort((a, b) => (b.vp?.total ?? 0) - (a.vp?.total ?? 0) || b.mcRemaining - a.mcRemaining);

  // In the action phase one player acts; in the draft and when buying cards several can, in any order.
  const actingSeats = Object.keys(table.legalMoves).map(Number).sort((a, b) => a - b);
  const seat = chosenSeat != null && actingSeats.includes(chosenSeat) ? chosenSeat : actingSeats[0] ?? null;
  const moves = seat != null ? table.legalMoves[seat] : null;
  const player = seat != null ? state.players.find(p => p.playerId === seat) ?? null : null;
  const actor = seat != null ? info.players.find(p => p.id === seatId(seat)) : undefined;
  const prompt = moves && player ? currentPrompt(moves, player) : null;
  const actions = !prompt && moves?.actions ? moves.actions : null;

  // What the player can put towards a cost in M€; more than their M€ when they may pay with heat (Helion).
  const spendable = player
    ? table.players.find(p => p.playerId === player.playerId)?.spendableMegaCredits ?? player.resources.megaCredits
    : 0;
  const canPayWithHeat = player != null && spendable > player.resources.megaCredits && player.resources.heat > 0;

  const submit = (move: MoveBody) => {
    if (seat != null) void game.submit(seat, move);
  };
  const act = player && actions ? playActions({ player, names: table.cardNames, canPayWithHeat, submit, setFlow }) : null;

  // A hex the game demands, or one the player asked to choose (a standard project, a plant conversion).
  const hexPrompt = prompt?.kind === 'hex' ? prompt : flow?.kind === 'hex' ? flow.prompt : null;
  const selection = hexPrompt && seat != null && !game.busy ? {
    hexKeys: new Set(hexPrompt.locations.map(l => hexKeyAt(state.map, l.col, l.row))),
    onSelect: (hexKey: string) => {
      const location = hexPrompt.locations.find(l => hexKeyAt(state.map, l.col, l.row) === hexKey);
      if (!location) return;

      const move = hexPrompt.move(location);
      const cost = (hexPrompt.fixedCost ?? 0) + (hexPrompt.hexIsFree ? 0 : hexPlacementCost(state.map, location));
      if (canPayWithHeat && cost > 0) setFlow({ kind: 'heat', title: hexPrompt.title.split(':')[0], cost, send: heat => ({ ...move, heat }) });
      else submit(move);
    },
  } : undefined;

  // Milestones and awards that can be taken now, offered on the map itself.
  const offers = act && actions && !flow && !game.busy ? [
    ...actions.claimableMilestones.map(m => ({ name: m.name, label: `Claim ${m.name}`, cost: MILESTONE_COST, onAct: () => act.claimMilestone(m.name) })),
    ...actions.fundableAwards.map(a => ({ name: a.name, label: `Fund ${a.name}`, cost: a.cost, onAct: () => act.fundAward(a.name, a.cost) })),
  ] : [];

  const sentence = game.viewingPast ? `Looking back at move ${state.moveNumber} of ${table.latestMoveNumber}`
    : gameOver ? 'Game over'
    : hexPrompt ? `${hexPrompt.title}${hexPrompt.locations.length > 0 ? ' — click a glowing hex' : ''}`
    : prompt ? prompt.title
    : actions && player ? `Action ${Math.min(player.actionsThisTurn + 1, 2)} of 2 — play a card, a project or an action`
    : 'Nobody can move in this position.';

  const statusOf = (p: EnginePlayer | undefined) => !p || gameOver ? ''
    : p.passed ? 'passed'
    : !actingSeats.includes(p.playerId) ? 'waiting'
    : state.phase === 'Action' ? `action ${Math.min(p.actionsThisTurn + 1, 2)} of 2`
    : 'choosing';

  const source = table.meta?.source;
  const start = startingPosition(table.meta);
  const ratio = mapDefinition ? mapDefinition.imageWidth / mapDefinition.imageHeight : 1;
  const zoomed = flow?.kind === 'card' ? flow.cardId : null;
  const showHand = player != null && actor != null && !game.viewingPast;

  return (
    <div className="flex h-screen flex-col overflow-hidden text-slate-200">
      <TopBar snapshot={snapshot}>
        {source?.tableId && (
          <>
            <span className="hidden whitespace-nowrap xl:inline">
              Table {source.tableId}, {source.moveIndex === 0 ? 'played again from the opening deal' : `forked after move ${source.moveNumber ?? source.moveIndex + 1}`}
            </span>
            {start && <ShareStart start={start} />}
            <Link to={`/replay/${source.tableId}?move=${source.moveIndex + 1}`} className="whitespace-nowrap font-semibold text-amber-400 hover:text-amber-300">
              Back to the replay
            </Link>
          </>
        )}
        <SoundToggle />
      </TopBar>

      <div className="flex min-h-0 flex-1 gap-3 p-3">
        <aside className="flex w-[300px] flex-shrink-0 flex-col gap-3 overflow-y-auto scrollbar-hidden">
          {info.players.map(p => (
            <PlayerPanel
              key={p.id}
              info={p}
              player={snapshot.players[p.id]}
              status={statusOf(state.players.find(x => seatId(x.playerId) === p.id))}
              isActive={!gameOver && !game.viewingPast && actingSeats.includes(Number(p.id))}
              isFirstPlayer={snapshot.firstPlayerId === p.id}
            />
          ))}
        </aside>

        <main className="relative flex min-w-0 flex-1 flex-col items-center">
          <div style={{ width: `min(100%, calc((100vh - 72px - ${showHand ? HAND_AREA : 0}px) * ${ratio}))` }}>
            {mapDefinition ? (
              <ReplayMap mapDefinition={mapDefinition} info={info} snapshot={snapshot} selection={selection} offers={offers} />
            ) : (
              <div className="play-panel mt-12 p-8 text-center text-slate-400">Map &ldquo;{state.map}&rdquo; not available for visualization.</div>
            )}
          </div>

          {hexPrompt && !game.viewingPast && (
            <div className="play-panel play-active absolute top-1 z-30 flex items-center gap-3 px-4 py-2">
              <span className="text-sm font-semibold text-white">{hexPrompt.title}</span>
              {hexPrompt.locations.length > 0 && <span className="text-sm text-slate-400">Click a glowing hex</span>}
              {flow?.kind === 'hex' && <PlayButton disabled={game.busy} onClick={() => setFlow(null)}>Cancel</PlayButton>}
              {hexPrompt.skip && (
                <PlayButton variant="primary" disabled={game.busy} onClick={() => submit(hexPrompt.skip!.move)}>{hexPrompt.skip.label}</PlayButton>
              )}
            </div>
          )}

          {showHand && (
            <div className="pointer-events-none absolute bottom-[-12px] left-0 right-0 z-40 flex flex-col items-center gap-2">
              {actions && act && !flow && (
                <div className="pointer-events-auto flex flex-wrap justify-center gap-2">
                  {actions.canConvertPlants && (
                    <PlayButton disabled={game.busy} onClick={() => act.convertPlants(actions)}>
                      🌱 {actions.plantConversionCost} plants → greenery
                    </PlayButton>
                  )}
                  {actions.canConvertHeat && (
                    <PlayButton disabled={game.busy} onClick={act.convertHeat}>🔥 8 heat → temperature</PlayButton>
                  )}
                  {actions.canPerformFirstAction && (
                    <PlayButton variant="primary" disabled={game.busy} onClick={() => submit({ type: 'PerformFirstAction' })}>
                      Corporation first action
                    </PlayButton>
                  )}
                  {actions.canEndTurn && (
                    <PlayButton variant="primary" disabled={game.busy} onClick={() => submit({ type: 'EndTurn' })}>End turn</PlayButton>
                  )}
                  {actions.canPass && (
                    <PlayButton variant="primary" disabled={game.busy} onClick={() => submit({ type: 'Pass' })} title="Take no more actions this generation">
                      Pass for this generation
                    </PlayButton>
                  )}
                </div>
              )}
              <Hand
                cardIds={player.hand}
                names={table.cardNames}
                playable={flow ? [] : actions?.playableCards ?? []}
                ownerName={actor.name}
                maxWidth={Math.min(1200, windowWidth - SIDE_COLUMNS)}
                onPick={cardId => setFlow({ kind: 'card', cardId })}
              />
            </div>
          )}
        </main>

        <aside className="flex w-[320px] flex-shrink-0 flex-col gap-3">
          <section className="play-panel play-active p-3" aria-live="polite">
            {game.viewingPast ? (
              <>
                <p className="text-sm text-slate-300">
                  Looking back at move {state.moveNumber} of {table.latestMoveNumber}. Moves can only be made from the current position.
                </p>
                <PlayButton variant="primary" className="mt-2" onClick={game.viewLatest}>Back to the current position</PlayButton>
              </>
            ) : gameOver ? (
              <FinalScores standings={standings} onShowBreakdown={() => setShowScores(true)} />
            ) : seat == null || !player || !actor ? (
              <p className="text-sm text-slate-400">Nobody can move in this position.</p>
            ) : (
              <>
                {actingSeats.length > 1 ? (
                  <div className="mb-1.5 flex flex-wrap gap-2" role="tablist" aria-label="Player to move for">
                    {actingSeats.map(s => (
                      <button
                        key={s}
                        type="button"
                        role="tab"
                        aria-selected={s === seat}
                        onClick={() => setChosenSeat(s)}
                        className={`rounded-lg border px-2.5 py-1 text-sm font-semibold transition-colors ${s === seat ? 'border-amber-400 bg-white/10 text-white' : 'border-white/10 text-slate-400 hover:text-white'}`}
                      >
                        {playerNames[s]}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-lg font-bold leading-tight" style={{ color: actor.color }}>{actor.name} to move</p>
                )}
                <p className="text-sm text-slate-300">{sentence}</p>
              </>
            )}
            {game.error && <p role="alert" className="mt-2 text-sm text-red-400">{game.error}</p>}
          </section>

          <ActionPanels
            actions={actions}
            act={flow ? null : act}
            names={table.cardNames}
            usedActions={actor ? snapshot.players[actor.id].usedActions : []}
            busy={game.busy}
          />
          <MoveFeed
            history={game.history}
            cardNames={game.cardNames}
            players={info.players}
            currentMoveNumber={state.moveNumber}
            onView={game.viewAt}
          />
        </aside>
      </div>

      {showIssues && importIssues.length > 0 && (
        <div className="fixed left-1/2 top-14 z-50 w-[min(640px,90vw)] -translate-x-1/2 rounded-lg border border-amber-700/50 bg-amber-950/95 px-4 py-3 text-sm text-amber-200 shadow-xl">
          <p className="font-semibold">This position may differ from the real game:</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {importIssues.map((issue, i) => <li key={i}>{issue.message}</li>)}
          </ul>
          <button type="button" className="mt-1 text-xs font-semibold text-amber-400 hover:text-amber-200" onClick={() => setShowIssues(false)}>Dismiss</button>
        </div>
      )}

      {gameOver && showScores && !game.viewingPast && (
        <EndGameSummary players={standings} winner={standings[0].playerName} onClose={() => setShowScores(false)} />
      )}

      {player && prompt && prompt.kind !== 'hex' && !game.viewingPast && (
        <Decision
          key={`${state.moveNumber}-${seat}`}
          prompt={prompt}
          player={player}
          spendable={spendable}
          names={table.cardNames}
          playerNames={playerNames}
          actor={actor}
          busy={game.busy}
          onMove={submit}
        />
      )}

      {/* What the last move did to cards, shown briefly over the board. It takes no clicks. */}
      {(burst || (game.draw && !game.viewingPast)) && (
        <div className="pointer-events-none fixed inset-0 z-[70] flex flex-wrap items-center justify-center gap-10">
          {burst && (
            <CardResourceBurst key={burst.key} changes={burst.changes} names={table.cardNames} onDone={() => setBurst(null)} />
          )}
          {game.draw && !game.viewingPast && (
            <CardDrawBurst
              key={game.draw.moveNumber}
              draw={game.draw}
              names={table.cardNames}
              players={info.players.map(p => ({ id: Number(p.id), name: p.name, color: p.color }))}
              onDone={game.dismissDraw}
            />
          )}
        </div>
      )}

      {showHand && zoomed && (
        <CardZoom
          name={table.cardNames[zoomed] ?? zoomed}
          playable={actions?.playableCards.find(c => c.cardId === zoomed)}
          busy={game.busy}
          onPlay={card => act?.playCard(card)}
          onClose={() => setFlow(null)}
        />
      )}

      {player && flow?.kind === 'pay' && (
        <Dialog title={flow.title} onClose={() => setFlow(null)}>
          <PaymentForm
            rules={flow.rules}
            player={player}
            names={table.cardNames}
            busy={game.busy}
            onConfirm={payment => submit(flow.send(payment))}
            onCancel={() => setFlow(null)}
          />
        </Dialog>
      )}

      {player && flow?.kind === 'heat' && (
        <Dialog title={flow.title} onClose={() => setFlow(null)}>
          <HeatSplitForm
            cost={flow.cost}
            player={player}
            busy={game.busy}
            onConfirm={heat => submit(flow.send(heat))}
            onCancel={() => setFlow(null)}
          />
        </Dialog>
      )}

      {player && flow?.kind === 'sell' && (
        <SellPatents player={player} names={table.cardNames} busy={game.busy} onMove={submit} onClose={() => setFlow(null)} />
      )}
    </div>
  );
}

/** A hand card held up to read, with the button to play it when it can be played. */
function CardZoom({ name, playable, busy, onPlay, onClose }: {
  name: string;
  playable: PlayableCard | undefined;
  busy: boolean;
  onPlay: (card: PlayableCard) => void;
  onClose: () => void;
}) {
  return (
    <Dialog title={name} onClose={onClose}>
      <div className="flex flex-col items-center gap-4">
        <img src={cardImage(name)} alt="" className="w-[340px] rounded-xl shadow-2xl" />
        {playable ? (
          <PlayButton variant="primary" className="px-6 py-2 text-base" disabled={busy} onClick={() => onPlay(playable)}>
            Play for {playable.effectiveCost} M€
          </PlayButton>
        ) : (
          <p className="text-sm text-slate-400">Not playable right now.</p>
        )}
      </div>
    </Dialog>
  );
}

function SellPatents({ player, names, busy, onMove, onClose }: {
  player: EnginePlayer;
  names: Record<string, string>;
  busy: boolean;
  onMove: (move: MoveBody) => void;
  onClose: () => void;
}) {
  const [selling, setSelling] = useState<ReadonlySet<string>>(new Set());
  const toggle = (cardId: string) => setSelling(current => {
    const next = new Set(current);
    if (!next.delete(cardId)) next.add(cardId);
    return next;
  });

  return (
    <Dialog title="Sell patents" subtitle="Discard cards from the hand for 1 M€ each." onClose={onClose} wide>
      <CardPicker cardIds={player.hand} names={names} selected={selling} disabled={busy} onPick={toggle} />
      <div className="mt-4 flex justify-center">
        <PlayButton
          variant="primary"
          disabled={busy || selling.size === 0}
          // Keep the engine's card order, not the order of clicking.
          onClick={() => onMove({ type: 'SellPatents', cardIds: player.hand.filter(id => selling.has(id)) })}
        >
          Sell {selling.size} for {selling.size} M€
        </PlayButton>
      </div>
    </Dialog>
  );
}

/** The result in the turn box, which stays put while the full breakdown is closed. */
function FinalScores({ standings, onShowBreakdown }: { standings: PlayerSummary[]; onShowBreakdown: () => void }) {
  return (
    <div>
      <p className="mb-2 text-lg font-bold text-amber-400">Game over — {standings[0].playerName} wins</p>
      <ol className="space-y-1">
        {standings.map(player => (
          <li key={player.playerId} className="flex items-center justify-between text-sm">
            <span className="font-semibold" style={{ color: player.color }}>{player.playerName}</span>
            <span className="font-bold text-white">{player.vp?.total ?? 0} VP</span>
          </li>
        ))}
      </ol>
      <PlayButton variant="primary" className="mt-2" onClick={onShowBreakdown}>Score breakdown</PlayButton>
    </div>
  );
}
