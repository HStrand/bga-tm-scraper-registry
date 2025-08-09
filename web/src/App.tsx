import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CorporationStatsPage } from "@/pages/CorporationStatsPage";

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
        <div className="mt-8">
          <p className="text-sm text-muted-foreground">
            To view corporation stats, navigate to: <code>/corporations/[slug]</code>
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Example: <code>/corporations/mining_guild</code>
          </p>
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
        <Route path="/corporations/:slug" element={<CorporationStatsPage />} />
      </Routes>
    </Router>
  );
}
