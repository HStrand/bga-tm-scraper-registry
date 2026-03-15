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
CorpCardCombos AS
(
    SELECT
        ep.TableId,
        ep.PlayerId,
        shcorp.Corporation,
        shc.Card,
        ep.EloChange,
        ep.Position
    FROM EligiblePlayers ep
    INNER JOIN dbo.StartingHandCorporations shcorp
        ON  shcorp.TableId  = ep.TableId
        AND shcorp.PlayerId = ep.PlayerId
        AND shcorp.Kept = 1
    INNER JOIN dbo.StartingHandCards shc
        ON  shc.TableId  = ep.TableId
        AND shc.PlayerId = ep.PlayerId
        AND shc.Kept = 1
)
SELECT
    ccc.Corporation,
    ccc.Card,
    GameCount    = COUNT(*),
    AvgEloChange = AVG(CONVERT(float, ccc.EloChange)),
    WinRate      = AVG(CASE WHEN ccc.Position = 1 THEN 1.0 ELSE 0.0 END)
FROM CorpCardCombos ccc
GROUP BY
    ccc.Corporation,
    ccc.Card
HAVING COUNT(*) >= 100
ORDER BY
    AvgEloChange DESC,
    GameCount DESC;