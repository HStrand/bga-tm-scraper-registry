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
PreludeCardCombos AS
(
    SELECT
        ep.TableId,
        ep.PlayerId,
        shp.Prelude,
        shc.Card,
        ep.EloChange,
        ep.Position
    FROM EligiblePlayers ep
    INNER JOIN dbo.StartingHandPreludes shp
        ON  shp.TableId  = ep.TableId
        AND shp.PlayerId = ep.PlayerId
        AND shp.Kept = 1
    INNER JOIN dbo.StartingHandCards shc
        ON  shc.TableId  = ep.TableId
        AND shc.PlayerId = ep.PlayerId
        AND shc.Kept = 1
)
SELECT
    pcc.Prelude,
    pcc.Card,
    GameCount    = COUNT(*) ,
    AvgEloChange = AVG(CONVERT(float, pcc.EloChange)),
    WinRate      = AVG(CASE WHEN pcc.Position = 1 THEN 1.0 ELSE 0.0 END)
FROM PreludeCardCombos pcc
GROUP BY
    pcc.Prelude,
    pcc.Card
HAVING COUNT(*) >= 100
ORDER BY
    AvgEloChange DESC,
    GameCount DESC;