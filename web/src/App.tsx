import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import HomePage from "@/pages/HomePage";
import { CorporationStatsPage } from "@/pages/CorporationStatsPage";
import { CorporationsOverviewPage } from "@/pages/CorporationsOverviewPage";
import { ProjectCardStatsPage } from "@/pages/ProjectCardStatsPage";
import { ProjectCardsOverviewPage } from "@/pages/ProjectCardsOverviewPage";
import { PreludesOverviewPage } from "@/pages/PreludesOverviewPage";
import { PreludeStatsPage } from "@/pages/PreludeStatsPage";
import { MilestonesOverviewPage } from "@/pages/MilestonesOverviewPage";
import { AwardsOverviewPage } from "@/pages/AwardsOverviewPage";
import { LeaderboardsPage } from "@/pages/LeaderboardsPage";
import { StartingHandOverviewPage } from "@/pages/StartingHandOverviewPage";
import { StartingHandStatsPage } from "@/pages/StartingHandStatsPage";
import { CombinationsPage } from "@/pages/CombinationsPage";
import { CombinationDetailPage } from "@/pages/CombinationDetailPage";
import { MapPage } from "@/pages/MapPage";
import { GameReplayPage } from "@/pages/GameReplayPage";
import { ResourcesPage } from "@/pages/ResourcesPage";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/replay/:tableId" element={
          <div className="replay-bg">
            <div className="mx-auto px-6 py-6"><GameReplayPage /></div>
          </div>
        } />
        <Route path="*" element={
          <Layout>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/corporations" element={<CorporationsOverviewPage />} />
              <Route path="/corporations/:name" element={<CorporationStatsPage />} />
              <Route path="/cards" element={<ProjectCardsOverviewPage />} />
              <Route path="/cards/:name" element={<ProjectCardStatsPage />} />
              <Route path="/startinghands" element={<StartingHandOverviewPage />} />
              <Route path="/startinghands/:name" element={<StartingHandStatsPage />} />
              <Route path="/preludes" element={<PreludesOverviewPage />} />
              <Route path="/prelude/:name" element={<PreludeStatsPage />} />
              <Route path="/combinations" element={<CombinationsPage />} />
              <Route path="/combinations/:kind/:name" element={<CombinationDetailPage />} />
              <Route path="/milestones" element={<MilestonesOverviewPage />} />
              <Route path="/awards" element={<AwardsOverviewPage />} />
              <Route path="/leaderboards" element={<LeaderboardsPage />} />
              <Route path="/maps" element={<MapPage />} />
              <Route path="/resources" element={<ResourcesPage />} />
            </Routes>
          </Layout>
        } />
      </Routes>
    </Router>
  );
}
