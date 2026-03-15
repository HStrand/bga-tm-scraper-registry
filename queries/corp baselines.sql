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
CorpStats AS
(
    SELECT
        ep.TableId,
        ep.PlayerId,
        shc.Corporation,
        ep.EloChange,
        ep.Position
    FROM EligiblePlayers ep
    INNER JOIN dbo.StartingHandCorporations shc
        ON  shc.TableId  = ep.TableId
        AND shc.PlayerId = ep.PlayerId
        AND shc.Kept = 1
)
SELECT
    cs.Corporation,
    GameCount    = COUNT(*),
    AvgEloChange = AVG(CONVERT(float, cs.EloChange)),
    WinRate      = AVG(CASE WHEN cs.Position = 1 THEN 1.0 ELSE 0.0 END)
FROM CorpStats cs
GROUP BY
    cs.Corporation
ORDER BY
    AvgEloChange DESC,
    GameCount DESC;