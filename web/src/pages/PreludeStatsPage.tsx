import { useParams } from 'react-router-dom';
import { getPreludeImage, getPreludePlaceholderImage, slugToPreludeName } from '@/lib/prelude';

export function PreludeStatsPage() {
  const { slug } = useParams<{ slug: string }>();
  
  if (!slug) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-2">
            Invalid Prelude
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            No prelude specified in the URL.
          </p>
        </div>
      </div>
    );
  }

  const preludeName = slugToPreludeName(slug);
  const imageSrc = getPreludeImage(preludeName) || getPreludePlaceholderImage();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-6">
            <img
              src={imageSrc}
              alt={preludeName}
              className="w-24 h-24 rounded-lg object-cover shadow-lg"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = getPreludePlaceholderImage();
              }}
            />
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">
                {preludeName}
              </h1>
              <p className="text-slate-600 dark:text-slate-400">
                Prelude statistics and analysis
              </p>
            </div>
          </div>
        </div>

        {/* Placeholder content */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-8 text-center">
          <div className="max-w-md mx-auto">
            <div className="w-16 h-16 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
              Coming Soon
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              Detailed prelude statistics and analysis will be available here soon. This will include performance metrics, win rates, and other insights.
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-500">
              For now, you can view prelude overview data on the <a href="/preludes" className="text-blue-600 dark:text-blue-400 hover:underline">Preludes Overview</a> page.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
