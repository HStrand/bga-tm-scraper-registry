import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CorporationStatsPage } from "@/pages/CorporationStatsPage";
import { CorporationsOverviewPage } from "@/pages/CorporationsOverviewPage";
import { ProjectCardStatsPage } from "@/pages/ProjectCardStatsPage";
import { ProjectCardsOverviewPage } from "@/pages/ProjectCardsOverviewPage";
import { PreludesOverviewPage } from "@/pages/PreludesOverviewPage";
import { PreludeStatsPage } from "@/pages/PreludeStatsPage";

function HomePage() {
  return (
    <div className="min-h-screen">
      <header className="bg-card shadow">
        <div className="max-w-6xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold">BGA TM Stats</h1>
        </div>
      </header>
      <main className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-4">
        <p className="text-muted-foreground">Corporation stats will appear here.</p>
        <div className="space-x-2">
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="link">Link</Button>
        </div>
        <div className="mt-8 space-y-4">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Overview Pages</h2>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <a href="/corporations">Corporations Overview</a>
              </Button>
              <Button asChild>
                <a href="/cards">Project Cards Overview</a>
              </Button>
              <Button asChild>
                <a href="/preludes">Preludes Overview</a>
              </Button>
            </div>
          </div>
          
          <div className="space-y-2">
            <h3 className="text-md font-medium">Individual Stats Pages</h3>
            <p className="text-sm text-muted-foreground">
              Corporation stats: <code>/corporations/[slug]</code> (e.g., <code>/corporations/mining_guild</code>)
            </p>
            <p className="text-sm text-muted-foreground">
              Project card stats: <code>/cards/[slug]</code> (e.g., <code>/cards/martian_rails</code>)
            </p>
            <p className="text-sm text-muted-foreground">
              Prelude stats: <code>/prelude/[slug]</code> (e.g., <code>/prelude/supply_drop</code>) - Coming soon
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/corporations" element={<CorporationsOverviewPage />} />
        <Route path="/corporations/:slug" element={<CorporationStatsPage />} />
        <Route path="/cards" element={<ProjectCardsOverviewPage />} />
        <Route path="/cards/:slug" element={<ProjectCardStatsPage />} />
        <Route path="/preludes" element={<PreludesOverviewPage />} />
        <Route path="/prelude/:slug" element={<PreludeStatsPage />} />
      </Routes>
    </Router>
  );
}
