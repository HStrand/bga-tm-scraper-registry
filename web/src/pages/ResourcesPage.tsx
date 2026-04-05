import { ExternalLink, Github, Download, Youtube, MessageCircle, Trophy } from "lucide-react";

export function ResourcesPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Resources
        </h1>
        <p className="mt-3 text-lg text-slate-600 dark:text-slate-400">
          This site is built on data from an open-source data collection project
          I started in May 2025, scraping and analyzing Terraforming Mars games
          played on BoardGameArena. All data and tools are made freely available
          to the community. Below you'll find the tools, content, and community
          behind it.
        </p>
      </div>

      {/* Scraper tool */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-800/80 backdrop-blur-sm p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300 border border-amber-100/70 dark:border-amber-800">
            <Github className="w-5 h-5" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            BGA TM Scraper
          </h2>
        </div>
        <p className="text-slate-600 dark:text-slate-400">
          A open-source game scraping tool for Terraforming Mars games on Board Game Arena I developed in Python. This crowdsources the data collection effort so that we can have all the data and statistics shown on this website. There is a downloadable executable that runs on Windows. You only need to put in your user credentials and click start scraping and everything happens automagically. Download it if you want to contribute to the project.
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            href="https://github.com/HStrand/bga-tm-scraper/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-slate-100 dark:bg-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          >
            <Github className="w-4 h-4" />
            View on GitHub
            <ExternalLink className="w-3 h-3" />
          </a>
          <a
            href="https://github.com/HStrand/bga-tm-scraper/releases/latest"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 px-4 py-2 text-sm font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors border border-amber-200/60 dark:border-amber-700/40"
          >
            <Download className="w-4 h-4" />
            Download Latest Release
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </section>

      {/* YouTube */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-800/80 backdrop-blur-sm p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300 border border-amber-100/70 dark:border-amber-800">
            <Youtube className="w-5 h-5" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Data Analysis Videos
          </h2>
        </div>
        <p className="text-slate-600 dark:text-slate-400">
          A playlist where I analyze data collected from this project.
        </p>
        <div className="aspect-video w-full rounded-xl overflow-hidden">
          <iframe
            className="w-full h-full"
            src="https://www.youtube.com/embed/videoseries?list=PLCkqcCdCEUkZ_gAr2amKmTQiet_Js8eSZ"
            title="YouTube playlist"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </section>

      {/* TFM Top 100 */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-800/80 backdrop-blur-sm p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300 border border-amber-100/70 dark:border-amber-800">
            <Trophy className="w-5 h-5" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Terraforming Mars Top 100
          </h2>
        </div>
        <p className="text-slate-600 dark:text-slate-400">
          A website made by anthracite with player profiles of the top 100
          players on BGA based on the data collected by this project.
        </p>
        <a
          href="https://tfm-data.xyz/"
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 hover:shadow-md transition-shadow"
        >
          <img
            src="/tfm-top100-preview.png"
            alt="Terraforming Mars Top 100 player profile preview"
            className="w-full"
          />
        </a>
        <a
          href="https://tfm-data.xyz/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 px-4 py-2 text-sm font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors border border-amber-200/60 dark:border-amber-700/40"
        >
          <Trophy className="w-4 h-4" />
          Visit TFM Top 100
          <ExternalLink className="w-3 h-3" />
        </a>
      </section>

      {/* Community */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-800/80 backdrop-blur-sm p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300 border border-amber-100/70 dark:border-amber-800">
            <MessageCircle className="w-5 h-5" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Community
          </h2>
        </div>
        <p className="text-slate-600 dark:text-slate-400">
          Join the Hodgepodge Discord server where top Terraforming Mars players
          discuss strategy on a daily basis.
        </p>
        <a
          href="https://discord.com/invite/KwJTFg9bZU"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 px-4 py-2 text-sm font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors border border-indigo-200/60 dark:border-indigo-700/40"
        >
          <MessageCircle className="w-4 h-4" />
          Join Hodgepodge Discord
          <ExternalLink className="w-3 h-3" />
        </a>
      </section>
    </div>
  );
}
