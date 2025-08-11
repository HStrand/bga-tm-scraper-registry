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

export default function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/corporations" element={<CorporationsOverviewPage />} />
          <Route path="/corporations/:slug" element={<CorporationStatsPage />} />
          <Route path="/cards" element={<ProjectCardsOverviewPage />} />
          <Route path="/cards/:name" element={<ProjectCardStatsPage />} />
          <Route path="/preludes" element={<PreludesOverviewPage />} />
          <Route path="/prelude/:slug" element={<PreludeStatsPage />} />
        </Routes>
      </Layout>
    </Router>
  );
}
