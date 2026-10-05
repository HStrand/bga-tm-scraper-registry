import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Info, Share2, Check, Copy, RefreshCw, MessageSquare, Send, Link, Unlink, GripHorizontal } from 'lucide-react';
import { api } from '@/lib/api';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import { ALL_MAPS, type MapDefinition } from '@/data/mapHexes';
import { fetchGameLog, assignPlayerColors } from '@/lib/gameLog';
import { getMapOverlays } from '@/data/mapOverlays';
import { buildStartingHandData, buildDraftData, detectMissingFeatures, resolveReplayStep } from '@/lib/replay/bga/folds';
import { buildBgaTimeline, bgaPlayerStats } from '@/lib/replay/bga/bgaAdapter';
import { ReplayMap } from '@/components/replay/ReplayMap';
import { ReplayControls } from '@/components/replay/ReplayControls';
import { GlobalParamsBar } from '@/components/replay/GlobalParamsBar';
import { MoveLog } from '@/components/replay/MoveLog';
import { PlayerCard } from '@/components/replay/PlayerCard';
import { PlayerTableau } from '@/components/replay/PlayerTableau';
import { DiscardPileModal } from '@/components/replay/DiscardPileModal';
import { StartingHandModal } from '@/components/replay/StartingHandModal';
import { DraftModal } from '@/components/replay/DraftModal';
import { EndGameSummary } from '@/components/replay/EndGameSummary';
import { CardPlayPopup, computeTrackerDeltas, type TrackerDelta, type PopupType } from '@/components/replay/CardPlayPopup';
import { PlayFromHere } from '@/components/play/PlayFromHere';
import { ReplayNotFound } from '@/components/replay/ReplayNotFound';
import type { GameLog } from '@/types/gamelog';

export function GameReplayPage() {
  const { tableId } = useParams<{ tableId: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const [gameLog, setGameLog] = useState<GameLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [tableauPlayerId, setTableauPlayerId] = useState<string | null>(null);
  const [showDiscardPile, setShowDiscardPile] = useState(false);
  const [expandedPlayerIds, setExpandedPlayerIds] = useState<Set<string>>(new Set());
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareIncludeMove, setShareIncludeMove] = useState(true);
  const [shareCopied, setShareCopied] = useState(false);
  const [startingHandOpen, setStartingHandOpen] = useState(false);
  const [startingHandCardSize, setStartingHandCardSize] = useState(110);
  const [startingHandHidden, setStartingHandHidden] = useState<Set<string>>(new Set());
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftCardSize, setDraftCardSize] = useState(160);
  const [draftHidden, setDraftHidden] = useState<Set<string>>(new Set());
  const [endGameOpen, setEndGameOpen] = useState(false);
  const [cardPopup, setCardPopup] = useState<{ type: PopupType; name: string; player: string; color: string; deltas: TrackerDelta[]; subtitle?: string } | null>(null);
  const prevStepRef = useRef<number>(-1);
  const prevDraftGen = useRef<number | null>(null);
  const [mapScale, setMapScale] = useState(0.8);
  const [mapOffset, setMapOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const collapseTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [controlsUnlinked, setControlsUnlinked] = useState(false);
  const [controlsOffset, setControlsOffset] = useState({ x: 0, y: 0 });
  const [isDraggingControls, setIsDraggingControls] = useState(false);
  const controlsDragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  const [logPosition, setLogPosition] = useState<{ top: number; left: number } | null>(null);
  const [isDraggingLog, setIsDraggingLog] = useState(false);
  const logDragStart = useRef({ x: 0, y: 0, top: 0, left: 0 });
  const logContainerRef = useRef<HTMLDivElement>(null);

  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [scrapeSuccess, setScrapeSuccess] = useState(false);

  // Comments
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<{ id: number; tableId: string; username: string; body: string; createdAt: string }[]>([]);
  const [commentBody, setCommentBody] = useState('');
  const [commentUsername, setCommentUsername] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [dailyLimitReached, setDailyLimitReached] = useState(false);

  // Without a perspective the server uses the one the table is registered under, or else the
  // highest-rated player; the replay is the same from every seat.
  const handleRescrape = useCallback(async (playerPerspective?: string) => {
    if (!tableId) return;
    setScraping(true);
    setScrapeError(null);
    setScrapeSuccess(false);
    try {
      await api.post('/api/scrape', playerPerspective ? { tableId, playerPerspective } : { tableId });
      setScrapeSuccess(true);
      // Re-fetch the game log after successful scrape
      const data = await fetchGameLog(tableId);
      setGameLog(data);
      setError(null);
      setCurrentStep(0);
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 429) {
        setDailyLimitReached(true);
        setScrapeError(e.response.data?.detail ?? 'Daily replay limit reached');
      } else if (status === 422) {
        setScrapeError("Board Game Arena didn't return this game. Check that the table ID is right and that the game is finished.");
      } else if (status === 503) {
        setScrapeError('The scraper is busy or offline. Try again in a minute.');
      } else {
        setScrapeError(e?.response?.data?.detail ?? e?.message ?? 'Scrape failed');
      }
    } finally {
      setScraping(false);
    }
  }, [tableId]);

  // Arriving from the landing page's "Open replay": fetch a game that is not stored yet without
  // asking. A link opened directly only offers the fetch, so a mistyped or crawled address does
  // not spend a replay view.
  const fetchIfMissing = !!(location.state as { fetchIfMissing?: boolean } | null)?.fetchIfMissing;
  const autoFetchedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!fetchIfMissing || loading || gameLog || !error) return;
    if (!tableId || !/^\d{6,12}$/.test(tableId) || autoFetchedFor.current === tableId) return;
    autoFetchedFor.current = tableId;
    handleRescrape();
  }, [fetchIfMissing, loading, gameLog, error, tableId, handleRescrape]);

  const fetchComments = useCallback(async () => {
    if (!tableId) return;
    try {
      const res = await api.get(`/api/comments/${tableId}`);
      setComments(res.data);
    } catch {
      // silently fail on fetch
    }
  }, [tableId]);

  useEffect(() => {
    if (gameLog && tableId) fetchComments();
  }, [gameLog, tableId, fetchComments]);

  const handleCommentSubmit = useCallback(async () => {
    if (!commentBody.trim() || !tableId) return;
    setCommentSubmitting(true);
    setCommentError(null);
    try {
      await api.post('/api/comments', {
        tableId,
        username: commentUsername.trim() || null,
        body: commentBody.trim(),
      });
      setCommentBody('');
      await fetchComments();
    } catch {
      setCommentError('Failed to submit comment. Please try again.');
    } finally {
      setCommentSubmitting(false);
    }
  }, [tableId, commentBody, commentUsername, fetchComments]);

  const handlePlayerExpand = useCallback((pid: string) => {
    const existing = collapseTimeouts.current.get(pid);
    if (existing) {
      clearTimeout(existing);
      collapseTimeouts.current.delete(pid);
    }
    setExpandedPlayerIds(prev => {
      if (prev.has(pid)) return prev;
      const next = new Set(prev);
      next.add(pid);
      return next;
    });
  }, []);

  const handlePlayerCollapse = useCallback((pid: string) => {
    collapseTimeouts.current.set(pid, setTimeout(() => {
      collapseTimeouts.current.delete(pid);
      setExpandedPlayerIds(prev => {
        if (!prev.has(pid)) return prev;
        const next = new Set(prev);
        next.delete(pid);
        return next;
      });
    }, 150));
  }, []);

  // --- data fetching ---
  useEffect(() => {
    if (!tableId) return;
    setLoading(true);
    setError(null);
    fetchGameLog(tableId)
      .then(data => {
        setGameLog(data);
        const moveParam = parseInt(searchParams.get('move') ?? '', 10);
        let initial = !isNaN(moveParam) && moveParam >= 1 ? Math.min(moveParam - 1, data.moves.length - 1) : 0;
        // Skip game_state_change moves backward
        while (initial > 0 && data.moves[initial]?.action_type === 'game_state_change') initial--;
        setCurrentStep(initial);
      })
      .catch(() => setError('Game not found.'))
      .finally(() => setLoading(false));
    api.get('/api/scrape-health').then(r => {
      if (r.data.dailyLimitReached) setDailyLimitReached(true);
    }).catch(() => {});
  }, [tableId]);

  // --- derived state ---
  const mapDefinition = useMemo<MapDefinition | undefined>(
    () => gameLog ? ALL_MAPS.find(m => m.dbName === gameLog.map) : undefined,
    [gameLog],
  );

  const playerColors = useMemo(
    () => gameLog ? assignPlayerColors(Object.keys(gameLog.players), gameLog.players) : {},
    [gameLog],
  );

  // Everything the shared replay components render comes from the view model; the rest of this page
  // reads the game log directly only for what is specific to BGA replays.
  const timeline = useMemo(() => gameLog ? buildBgaTimeline(gameLog) : null, [gameLog]);
  const snapshot = useMemo(
    () => timeline ? timeline.snapshotAt(currentStep) : null,
    [timeline, currentStep],
  );

  const offMapTiles = useMemo(() => {
    if (!mapDefinition || !snapshot) return [];
    const hexKeys = new Set(mapDefinition.hexes.map(h => h.dbKey));
    const overlays = getMapOverlays(mapDefinition.name);
    const renderedOffMap = new Set(overlays.offMapTiles?.map(t => t.name) ?? []);
    return snapshot.tiles.filter(t => !hexKeys.has(t.hexKey) && !renderedOffMap.has(t.hexKey));
  }, [snapshot, mapDefinition]);

  const generationBoundaries = useMemo(
    () => timeline?.generationBoundaries ?? new Map<number, { start: number; end: number }>(),
    [timeline],
  );

  // Build starting hand data for the modal — sensitive to currentStep
  const startingHandData = useMemo(
    () => gameLog ? buildStartingHandData(gameLog, currentStep, playerColors) : null,
    [gameLog, currentStep, playerColors],
  );

  // Compute active draft data based on currentStep
  const draftData = useMemo(
    () => gameLog ? buildDraftData(gameLog, currentStep, playerColors) : null,
    [gameLog, currentStep, playerColors],
  );

  // Track draft generation changes (no auto-open)
  useEffect(() => {
    prevDraftGen.current = draftData?.generation ?? null;
  }, [draftData?.generation]);

  // Resolve a step index to skip game_state_change moves
  const resolveStep = useCallback((target: number, direction: 'forward' | 'backward' | 'auto' = 'auto') => {
    if (!gameLog) return target;
    return resolveReplayStep(gameLog, target, direction);
  }, [gameLog]);

  // --- jump ---
  const jumpTo = useCallback((target: number) => {
    if (!gameLog) return;
    setCurrentStep(resolveStep(target, 'auto'));
  }, [gameLog, resolveStep]);

  // --- missing features detection ---
  const missingFeatures = useMemo(() => gameLog ? detectMissingFeatures(gameLog) : [], [gameLog]);

  // --- keyboard ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!gameLog) return;
      if (e.key === 'ArrowLeft' && currentStep > 0) setCurrentStep(s => resolveStep(s - 1, 'backward'));
      else if (e.key === 'ArrowRight' && currentStep < gameLog.moves.length - 1) setCurrentStep(s => resolveStep(s + 1, 'forward'));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [gameLog, currentStep, resolveStep]);

  // Trigger popup when stepping forward to a card play, milestone, or award move
  useEffect(() => {
    if (!gameLog || currentStep === prevStepRef.current) return;
    const isForward = currentStep > prevStepRef.current;
    prevStepRef.current = currentStep;
    if (!isForward) { setCardPopup(null); return; }
    const move = gameLog.moves[currentStep];
    if (!move) { setCardPopup(null); return; }

    const prevTrackers = currentStep > 0
      ? gameLog.moves[currentStep - 1]?.game_state?.player_trackers?.[move.player_id]
      : undefined;
    const currTrackers = move.game_state?.player_trackers?.[move.player_id];
    const deltas = computeTrackerDeltas(
      prevTrackers && bgaPlayerStats(prevTrackers),
      currTrackers && bgaPlayerStats(currTrackers),
    );

    const color = playerColors[move.player_id] ?? '#888';
    const base = { player: move.player_name, color, deltas };

    if (move.action_type === 'claim_milestone' || move.description.match(/claims milestone /i)) {
      const match = move.description.match(/claims milestone (.+?)(?:\s*\||\s*$)/i);
      if (match) {
        setCardPopup({ ...base, type: 'milestone', name: match[1].trim() });
      } else { setCardPopup(null); }
    } else if (move.action_type === 'fund_award' || move.description.match(/funds .+? award/i)) {
      const match = move.description.match(/funds (.+?) award/i);
      if (match) {
        setCardPopup({ ...base, type: 'award', name: match[1].trim() });
      } else { setCardPopup(null); }
    } else if (move.action_type === 'standard_project') {
      const match = move.description.match(/plays standard project (.+?)(?:\s*\||\s*$)/i);
      setCardPopup({ ...base, type: 'standard_project', name: match ? match[1].trim() : '' });
    } else if (move.action_type === 'activate_card') {
      const match = move.description.match(/activates (.+?)(?:\s*\||\s*$)/i);
      setCardPopup({ ...base, type: 'activate_card', name: match ? match[1].trim() : '' });
    } else if (move.action_type === 'draw') {
      // "draws CardName" or "draws N cards: Name1, Name2, ..."
      const multi = move.description.match(/draws \d+ cards?:\s*(.+?)(?:\s*\||\s*$)/i);
      if (multi) {
        const names = multi[1].split(',').map(s => s.trim()).filter(Boolean);
        const first = names[0] ?? '';
        const subtitle = names.length > 1 ? `+ ${names.length - 1} more` : undefined;
        setCardPopup({ ...base, type: 'draw', name: first, subtitle });
      } else {
        const single = move.description.match(/draws (.+?)(?:\s*\||\s*$)/i);
        setCardPopup({ ...base, type: 'draw', name: single ? single[1].trim() : '' });
      }
    } else if (/\bpays 8 Heat\b/i.test(move.description)) {
      // BGA's `convert_heat` action_type is misleading — it's used for ANY
      // temperature increase, including card effects. The literal "pays 8 Heat"
      // string is the reliable signal for an actual heat-to-temperature
      // conversion.
      setCardPopup({ ...base, type: 'convert_heat', name: 'heat → temperature' });
    } else if (/\bpays 8 Plant\b/i.test(move.description)) {
      setCardPopup({ ...base, type: 'convert_plants', name: 'plants → greenery' });
    } else if (move.card_played && move.action_type !== 'draft') {
      setCardPopup({ ...base, type: 'card', name: move.card_played });
    } else {
      setCardPopup(null);
    }
  }, [gameLog, currentStep, playerColors]);

  // Auto-open end game summary when reaching the last move
  const lastMoveState = gameLog?.moves[gameLog.moves.length - 1]?.game_state;
  const isAtLastMove = gameLog ? currentStep === gameLog.moves.length - 1 : false;
  useEffect(() => {
    if (isAtLastMove && lastMoveState?.player_vp) {
      setEndGameOpen(true);
    }
  }, [isAtLastMove, lastMoveState?.player_vp]);

  // --- render ---
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-400 py-8">
        <div className="w-5 h-5 border-2 border-slate-600 border-t-amber-500 rounded-full animate-spin" />
        Loading game replay...
      </div>
    );
  }

  if (error || !gameLog || !timeline || !snapshot) {
    return (
      <ReplayNotFound
        tableId={tableId}
        dailyLimitReached={dailyLimitReached}
        scraping={scraping}
        scrapeError={scrapeError}
        onFetch={() => handleRescrape()}
      />
    );
  }

  const currentMove = gameLog.moves[currentStep];
  const gameState = currentMove?.game_state;
  const isLastMove = currentStep === gameLog.moves.length - 1;
  const players = timeline.info.players;

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-white tracking-tight glow-white">
            Table {tableId}
            {mapDefinition && (
              <span className="text-slate-400 font-normal" style={{ textShadow: 'none' }}> &mdash; {mapDefinition.name}</span>
            )}
          </h1>
          <button
            onClick={() => { setShareCopied(false); setShowShareDialog(true); }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Share replay"
          >
            <Share2 size={18} />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-400">
          {gameLog.game_date && <span>{gameLog.game_date}</span>}
          {gameLog.game_speed && <span className="text-slate-500">{gameLog.game_speed}</span>}
          {([
            ['Prelude', gameLog.prelude_on],
            ['Colonies', gameLog.colonies_on],
            ['Draft', gameLog.draft_on],
            ['Corp Era', gameLog.corporate_era_on],
          ] as const).map(([label, val]) => val != null && (
            <span key={label} className="inline-flex items-center gap-1.5">
              <span className={`inline-block w-2 h-2 rounded-full ${val ? 'bg-green-500 glow-green' : 'bg-slate-600'}`} />
              <span className={val ? 'text-slate-300' : 'text-slate-500'}>{label}</span>
            </span>
          ))}
          {gameLog.winner && currentStep === gameLog.moves.length - 1 && (
            <span className="font-medium text-amber-400 glow-amber">Winner: {gameLog.winner}</span>
          )}
          <button
            onClick={() => setShowComments(prev => !prev)}
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            <MessageSquare size={16} />
            <span>Comments{comments.length > 0 ? ` (${comments.length})` : ''}</span>
          </button>
          {tableId && (
            <PlayFromHere
              tableId={tableId}
              moveIndex={currentStep}
              playerNames={Object.fromEntries(players.map(p => [p.id, p.name]))}
            />
          )}
        </div>
      </div>

      {showComments && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowComments(false)}>
          <div className="glass-panel rounded-xl p-5 w-[520px] max-w-[90vw] shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-4">Comments</h2>
            {comments.length > 0 ? (
              <div className="space-y-3 mb-4 max-h-72 overflow-y-auto pr-1">
                {comments.map(c => (
                  <div key={c.id} className="text-sm">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium text-slate-200">{c.username}</span>
                      <span className="text-xs text-slate-500">{new Date(c.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-slate-300 mt-0.5 whitespace-pre-wrap">{c.body}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 mb-4">No comments yet. Be the first!</p>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Name (optional)"
                value={commentUsername}
                onChange={e => setCommentUsername(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white placeholder-slate-500 w-36 focus:outline-none focus:border-slate-400"
              />
              <input
                type="text"
                placeholder="Write a comment..."
                value={commentBody}
                onChange={e => setCommentBody(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && commentBody.trim()) handleCommentSubmit(); }}
                className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white placeholder-slate-500 flex-1 focus:outline-none focus:border-slate-400"
              />
              <button
                onClick={handleCommentSubmit}
                disabled={commentSubmitting || !commentBody.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send size={14} />
              </button>
            </div>
            {commentError && <p className="mt-2 text-sm text-red-400">{commentError}</p>}
          </div>
        </div>
      )}

      {missingFeatures.length > 0 && (
        <div className="mb-4 w-fit bg-amber-900/20 border border-amber-800/40 rounded-lg px-3 py-2 text-sm text-amber-300 flex items-center gap-2">
          <span>Older scraper version. Some features are missing.</span>
          <div className="relative group flex-shrink-0">
            <Info className="w-4 h-4 cursor-help text-amber-400" />
            <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 hidden group-hover:block z-50 bg-slate-800 text-white text-xs rounded-lg px-3 py-2 shadow-lg whitespace-nowrap border border-slate-700">
              <p className="font-medium mb-1">Missing features:</p>
              <ul className="list-disc list-inside space-y-0.5">
                {missingFeatures.map(f => <li key={f.key}>{f.label}</li>)}
              </ul>
            </div>
          </div>
          {dailyLimitReached ? (
            <span className="text-xs text-amber-400">Re-scrape unavailable — daily replay limit reached.</span>
          ) : (
            <button
              onClick={() => handleRescrape(gameLog.player_perspective)}
              disabled={scraping}
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <RefreshCw size={12} className={scraping ? 'animate-spin' : ''} />
              {scraping ? 'Scraping...' : 'Re-scrape'}
            </button>
          )}
          {scrapeError && <span className="text-xs text-red-400">{scrapeError}</span>}
        </div>
      )}

      {/* Main content — 3 column layout */}
      <div className="flex gap-4 overflow-x-clip">
        {/* Left: Player cards */}
        <div className="w-[320px] flex-shrink-0 space-y-3">
          {players.filter(p => snapshot.players[p.id]?.vp).map(p => {
            const player = snapshot.players[p.id];
            const corporation = p.corporation ?? '';
            return (
              <PlayerCard
                key={p.id}
                playerId={p.id}
                playerName={p.name}
                corporation={player.headquarters.includes(corporation) ? corporation : ''}
                color={p.color}
                elo={p.elo ?? null}
                player={player}
                isStartingPlayer={snapshot.firstPlayerId === p.id}
                isExpanded={expandedPlayerIds.has(p.id)}
                onExpand={() => handlePlayerExpand(p.id)}
                onCollapse={() => handlePlayerCollapse(p.id)}
              />
            );
          })}
        </div>

        {/* Center: Map + controls */}
        <div className="flex-1 min-w-0 flex flex-col items-center relative">
          <div
            className="relative inline-flex flex-col items-center"
            style={{
              transform: `translate(${mapOffset.x}px, ${mapOffset.y}px)`,
              cursor: isDragging ? 'grabbing' : 'grab',
              userSelect: 'none',
            }}
            onMouseDown={e => {
              if (e.button !== 0) return;
              // Don't drag when interacting with controls
              const target = e.target as HTMLElement;
              if (target.closest('button, input[type="range"], input[type="checkbox"]')) return;
              setIsDragging(true);
              dragStart.current = { x: e.clientX, y: e.clientY, ox: mapOffset.x, oy: mapOffset.y };
              const onMove = (ev: MouseEvent) => {
                setMapOffset({
                  x: dragStart.current.ox + (ev.clientX - dragStart.current.x),
                  y: dragStart.current.oy + (ev.clientY - dragStart.current.y),
                });
              };
              const onUp = () => {
                setIsDragging(false);
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
              };
              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            }}
          >
            {/* Zoom slider */}
            <div className="flex items-center gap-2 mb-2" style={{ cursor: 'default' }}>
              <span className="text-xs text-slate-500">−</span>
              <input
                type="range"
                min={0.5}
                max={1}
                step={0.05}
                value={mapScale}
                onChange={e => setMapScale(parseFloat(e.target.value))}
                className="w-32 accent-amber-500"
              />
              <span className="text-xs text-slate-500">+</span>
              <span className="text-xs text-slate-400 w-10 text-center">{Math.round(mapScale * 100)}%</span>
              <button onClick={() => { setMapScale(0.8); setMapOffset({ x: 0, y: 0 }); }} className="text-xs text-slate-500 hover:text-slate-300 ml-1" title="Reset map zoom">↺</button>
            </div>

            <div style={{ width: `${mapScale * 100}%` }} className="relative">
              {/* Card play popup */}
              {cardPopup && (
                <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
                  <CardPlayPopup
                    type={cardPopup.type}
                    name={cardPopup.name}
                    playerName={cardPopup.player}
                    playerColor={cardPopup.color}
                    deltas={cardPopup.deltas}
                    subtitle={cardPopup.subtitle}
                    onDone={() => setCardPopup(null)}
                  />
                </div>
              )}
              {/* Floating call-to-action buttons */}
              {(startingHandData && !startingHandOpen || draftData && !draftOpen) && (
                <div className="absolute left-1/2 -translate-x-1/2 top-[30%] z-40 flex gap-2 pointer-events-none">
                  {startingHandData && !startingHandOpen && (
                    <button
                      onClick={() => setStartingHandOpen(true)}
                      className="glass-panel rounded-xl px-5 py-2.5 text-lg font-bold text-white glow-white hover:text-white/80 transition-colors animate-breathe cursor-pointer border border-white/30 pointer-events-auto"
                    >
                      Starting Hands
                    </button>
                  )}
                  {draftData && !draftOpen && (
                    <button
                      onClick={() => setDraftOpen(true)}
                      className="glass-panel rounded-xl px-5 py-2.5 text-lg font-bold text-white glow-white hover:text-white/80 transition-colors animate-breathe cursor-pointer border border-white/30 pointer-events-auto"
                    >
                      Draft (Gen {draftData.generation})
                    </button>
                  )}
                </div>
              )}
              {mapDefinition ? (
                <ReplayMap mapDefinition={mapDefinition} info={timeline.info} snapshot={snapshot} />
              ) : (
                <div className="glass-panel rounded-xl p-8 text-center text-slate-400">
                  Map &ldquo;{gameLog.map}&rdquo; not available for visualization.
                </div>
              )}

              {offMapTiles.length > 0 && (
                <div className="mt-3 text-sm text-slate-400 text-left">
                  <span className="font-medium text-slate-300">Off-map tiles:</span>{' '}
                  {offMapTiles.map((t, i) => (
                    <span key={t.hexKey}>
                      {i > 0 && ', '}
                      <span className="inline-block w-2.5 h-2.5 rounded-full mr-1" style={{ backgroundColor: t.placedBy != null ? playerColors[t.placedBy] : undefined }} />
                      {t.hexKey} ({t.type} &mdash; {(t.placedBy != null ? gameLog.players[t.placedBy]?.player_name : undefined) ?? t.placedBy})
                    </span>
                  ))}
                </div>
              )}
            </div>

            {!controlsUnlinked && (
              <ReplayControls
                currentStep={currentStep}
                totalMoves={gameLog.moves.length}
                generation={snapshot.generation}
                isAnimating={false}
                onPrev={() => setCurrentStep(s => resolveStep(s - 1, 'backward'))}
                onNext={() => setCurrentStep(s => resolveStep(s + 1, 'forward'))}
                onJump={jumpTo}
                generationBoundaries={generationBoundaries}
                unlinked={false}
                onToggleUnlink={() => setControlsUnlinked(true)}
              />
            )}
          </div>

          {controlsUnlinked && (
            <div
              className="absolute z-40"
              style={{
                bottom: '1rem',
                left: '50%',
                transform: `translate(calc(-50% + ${controlsOffset.x}px), ${controlsOffset.y}px)`,
                cursor: isDraggingControls ? 'grabbing' : 'grab',
                userSelect: 'none',
              }}
              onMouseDown={e => {
                if (e.button !== 0) return;
                const target = e.target as HTMLElement;
                if (target.closest('button, input[type="range"]')) return;
                setIsDraggingControls(true);
                controlsDragStart.current = { x: e.clientX, y: e.clientY, ox: controlsOffset.x, oy: controlsOffset.y };
                const onMove = (ev: MouseEvent) => {
                  setControlsOffset({
                    x: controlsDragStart.current.ox + (ev.clientX - controlsDragStart.current.x),
                    y: controlsDragStart.current.oy + (ev.clientY - controlsDragStart.current.y),
                  });
                };
                const onUp = () => {
                  setIsDraggingControls(false);
                  window.removeEventListener('mousemove', onMove);
                  window.removeEventListener('mouseup', onUp);
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
              }}
            >
              <ReplayControls
                currentStep={currentStep}
                totalMoves={gameLog.moves.length}
                generation={snapshot.generation}
                isAnimating={false}
                onPrev={() => setCurrentStep(s => resolveStep(s - 1, 'backward'))}
                onNext={() => setCurrentStep(s => resolveStep(s + 1, 'forward'))}
                onJump={jumpTo}
                generationBoundaries={generationBoundaries}
                unlinked={true}
                onToggleUnlink={() => { setControlsUnlinked(false); setControlsOffset({ x: 0, y: 0 }); }}
              />
            </div>
          )}
        </div>

        {/* Right: Global params + Move log */}
        <div className="w-[380px] flex-shrink-0 space-y-3 lg:self-start lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto scrollbar-hidden">
          <GlobalParamsBar snapshot={snapshot} onOpenDiscardPile={() => setShowDiscardPile(true)} />
          <div
            ref={logContainerRef}
            className={logPosition ? 'fixed z-50 w-[380px]' : ''}
            style={logPosition ? { top: logPosition.top, left: logPosition.left } : undefined}
          >
            <div
              className="flex items-center justify-center py-1 cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-400 transition-colors"
              onMouseDown={e => {
                if (e.button !== 0) return;
                setIsDraggingLog(true);
                const rect = logContainerRef.current!.getBoundingClientRect();
                const pos = logPosition ?? { top: rect.top, left: rect.left };
                logDragStart.current = { x: e.clientX, y: e.clientY, top: pos.top, left: pos.left };
                const onMove = (ev: MouseEvent) => {
                  setLogPosition({
                    top: logDragStart.current.top + (ev.clientY - logDragStart.current.y),
                    left: logDragStart.current.left + (ev.clientX - logDragStart.current.x),
                  });
                };
                const onUp = () => {
                  setIsDraggingLog(false);
                  window.removeEventListener('mousemove', onMove);
                  window.removeEventListener('mouseup', onUp);
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
              }}
              title="Drag to reposition"
            >
              <GripHorizontal className="w-5 h-5" />
            </div>
            <MoveLog moves={gameLog.moves} currentStep={currentStep} generationBoundaries={generationBoundaries} playerColors={playerColors} onJump={jumpTo} />
          </div>
        </div>
      </div>

      {tableauPlayerId && gameLog.players[tableauPlayerId] && (
        <PlayerTableau
          playerName={gameLog.players[tableauPlayerId].player_name}
          corporation={gameLog.players[tableauPlayerId].corporation}
          color={playerColors[tableauPlayerId]}
          headquarters={snapshot.players[tableauPlayerId]?.headquarters ?? []}
          played={snapshot.players[tableauPlayerId]?.played ?? []}
          hand={snapshot.players[tableauPlayerId]?.hand ?? []}
          sold={snapshot.players[tableauPlayerId]?.sold ?? []}
          cardResources={snapshot.players[tableauPlayerId]?.cardResources ?? {}}
          onClose={() => setTableauPlayerId(null)}
        />
      )}

      {showDiscardPile && (
        <DiscardPileModal cards={snapshot.piles.discardCards ?? []} onClose={() => setShowDiscardPile(false)} />
      )}

      {startingHandData && startingHandOpen && (
        <StartingHandModal
          players={startingHandData}
          onClose={() => setStartingHandOpen(false)}
          cardSize={startingHandCardSize}
          onCardSizeChange={setStartingHandCardSize}
          hiddenPlayers={startingHandHidden}
          onHiddenPlayersChange={setStartingHandHidden}
        />
      )}

      {draftData && draftOpen && (
        <DraftModal
          draft={draftData}
          onClose={() => setDraftOpen(false)}
          cardSize={draftCardSize}
          onCardSizeChange={setDraftCardSize}
          hiddenPlayers={draftHidden}
          onHiddenPlayersChange={setDraftHidden}
        />
      )}

      {endGameOpen && isLastMove && gameState?.player_vp && gameLog && (
        <EndGameSummary
          players={players.map(p => {
            const player = snapshot.players[p.id];
            return {
              playerId: p.id,
              playerName: p.name,
              color: p.color,
              corporation: p.corporation ?? '',
              vp: player.vp,
              finalVp: gameLog.players[p.id].final_vp,
              mcRemaining: player.statsKnown ? player.resources.mc : null,
            };
          })}
          winner={gameLog.winner}
          onClose={() => setEndGameOpen(false)}
        />
      )}


      {showShareDialog && (() => {
        const url = new URL(window.location.origin + `/replay/${tableId}`);
        if (shareIncludeMove && currentStep > 0) url.searchParams.set('move', String(currentStep + 1));
        const shareUrl = url.toString();
        return (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60" onClick={() => setShowShareDialog(false)}>
            <div className="glass-panel rounded-xl p-5 w-[520px] max-w-[90vw] shadow-2xl" onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-bold text-white mb-3">Share Replay</h2>
              <div className="flex gap-2 mb-3">
                <input
                  readOnly
                  value={shareUrl}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 select-all outline-none focus:border-blue-500/50"
                  onFocus={e => e.target.select()}
                />
                <button
                  onClick={() => { navigator.clipboard.writeText(shareUrl); setShareCopied(true); }}
                  className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium flex items-center gap-1.5 transition-colors"
                >
                  {shareCopied ? <Check size={16} /> : <Copy size={16} />}
                  {shareCopied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={shareIncludeMove}
                  onChange={e => { setShareIncludeMove(e.target.checked); setShareCopied(false); }}
                  className="rounded border-white/20 bg-white/5 text-blue-500 focus:ring-blue-500/30"
                />
                Include current move ({currentStep + 1})
              </label>
            </div>
          </div>
        );
      })()}

      {scrapeSuccess && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60" onClick={() => setScrapeSuccess(false)}>
          <div className="glass-panel rounded-xl p-5 w-[400px] max-w-[90vw] shadow-2xl text-center" onClick={e => e.stopPropagation()}>
            <Check className="mx-auto mb-3 text-green-400" size={36} />
            <h2 className="text-lg font-bold text-white mb-1">Re-scrape complete</h2>
            <p className="text-sm text-slate-400 mb-4">The game was successfully re-scraped and reloaded.</p>
            <button
              onClick={() => setScrapeSuccess(false)}
              className="px-4 py-1.5 rounded-lg text-sm font-medium bg-green-600 hover:bg-green-500 text-white transition-colors"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
