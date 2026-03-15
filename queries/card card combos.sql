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
EligibleCards AS
(
    SELECT
        ep.TableId,
        ep.PlayerId,
        shc.Card,
        ep.EloChange,
        ep.Position
    FROM EligiblePlayers ep
    INNER JOIN dbo.StartingHandCards shc
        ON  shc.TableId  = ep.TableId
        AND shc.PlayerId = ep.PlayerId
        AND shc.Kept = 1
),
CardCardCombos AS
(
    SELECT
        c1.TableId,
        c1.PlayerId,
        Card1 = c1.Card,
        Card2 = c2.Card,
        c1.EloChange,
        c1.Position
    FROM EligibleCards c1
    INNER JOIN EligibleCards c2
        ON  c2.TableId  = c1.TableId
        AND c2.PlayerId = c1.PlayerId
        AND c1.Card < c2.Card
)
SELECT
    ccc.Card1,
    ccc.Card2,
    GameCount    = COUNT(*),
    AvgEloChange = AVG(CONVERT(float, ccc.EloChange)),
    WinRate      = AVG(CASE WHEN ccc.Position = 1 THEN 1.0 ELSE 0.0 END)
FROM CardCardCombos ccc
GROUP BY
    ccc.Card1,
    ccc.Card2
HAVING COUNT(*) >= 100
ORDER BY
    AvgEloChange DESC,
    GameCount DESC;