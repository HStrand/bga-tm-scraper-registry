;WITH EligiblePlayers AS
(
    SELECT
        gpc.TableId,
        gpc.PlayerId,
        gpc.EloChange,
        gpc.Position
    FROM dbo.GamePlayers_Canonical gpc
    INNER JOIN dbo.Games_Canonical gc
        ON gc.TableId = gpc.TableId
    INNER JOIN dbo.GameStats gs
        ON gs.TableId = gpc.TableId
    WHERE
        gs.PlayerCount = 2
        AND gc.GameMode <> 'Friendly mode'
        AND gc.ColoniesOn = 0
        AND gc.PreludeOn = 1
        AND gc.DraftOn = 1
),
EligiblePreludes AS
(
    SELECT
        ep.TableId,
        ep.PlayerId,
        shp.Prelude,
        ep.EloChange,
        ep.Position
    FROM EligiblePlayers ep
    INNER JOIN dbo.StartingHandPreludes shp
        ON  shp.TableId  = ep.TableId
        AND shp.PlayerId = ep.PlayerId
        AND shp.Kept = 1
),
PreludePreludeCombos AS
(
    SELECT
        p1.TableId,
        p1.PlayerId,
        Prelude1 = p1.Prelude,
        Prelude2 = p2.Prelude,
        p1.EloChange,
        p1.Position
    FROM EligiblePreludes p1
    INNER JOIN EligiblePreludes p2
        ON  p2.TableId  = p1.TableId
        AND p2.PlayerId = p1.PlayerId
        AND p1.Prelude < p2.Prelude
)
SELECT
    ppc.Prelude1,
    ppc.Prelude2,
    GameCount    = COUNT(*),
    AvgEloChange = AVG(CONVERT(float, ppc.EloChange)),
    WinRate      = AVG(CASE WHEN ppc.Position = 1 THEN 1.0 ELSE 0.0 END)
FROM PreludePreludeCombos ppc
GROUP BY
    ppc.Prelude1,
    ppc.Prelude2
HAVING COUNT(*) >= 100
ORDER BY
    AvgEloChange DESC,
    GameCount DESC;