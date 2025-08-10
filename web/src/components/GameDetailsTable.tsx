import { useState, useMemo } from 'react';
import { CorporationPlayerStatsRow } from '@/types/corporation';
import { Button } from '@/components/ui/button';

interface GameDetailsTableProps {
  data: CorporationPlayerStatsRow[];
}

type SortField = keyof CorporationPlayerStatsRow;
type SortDirection = 'asc' | 'desc' | null;

export function GameDetailsTable({ data }: GameDetailsTableProps) {
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Sort data based on current sort settings
  const sortedData = useMemo(() => {
    if (!sortField || !sortDirection) return data;

    return [...data].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];

      // Handle null/undefined values - always put them at the end
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;  // Always put nulls at end
      if (bVal == null) return -1; // Always put nulls at end

      // Numeric comparison
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }

      // String comparison
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      if (aStr < bStr) return sortDirection === 'asc' ? -1 : 1;
      if (aStr > bStr) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, sortField, sortDirection]);

  // Paginate the sorted data
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return sortedData.slice(startIndex, endIndex);
  }, [sortedData, currentPage, pageSize]);

  // Calculate pagination info
  const totalPages = Math.ceil(sortedData.length / pageSize);
  const startRow = (currentPage - 1) * pageSize + 1;
  const endRow = Math.min(currentPage * pageSize, sortedData.length);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Cycle through: asc -> desc -> null
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortField(null);
        setSortDirection(null);
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    // Reset to first page when sorting changes
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setCurrentPage(1); // Reset to first page when page size changes
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return '↕️';
    if (sortDirection === 'asc') return '↑';
    if (sortDirection === 'desc') return '↓';
    return '↕️';
  };

  const getPositionDisplay = (position?: number) => {
    if (!position) return 'N/A';
    if (position === 1) return '🥇 1st';
    if (position === 2) return '🥈 2nd';
    if (position === 3) return '🥉 3rd';
    return `${position}th`;
  };

  const getEloChangeDisplay = (eloChange?: number) => {
    if (eloChange == null) return 'N/A';
    const prefix = eloChange > 0 ? '+' : '';
    const colorClass = eloChange > 0 
      ? 'text-green-600 dark:text-green-400' 
      : eloChange < 0 
        ? 'text-red-600 dark:text-red-400' 
        : 'text-slate-600 dark:text-slate-400';
    
    return (
      <span className={colorClass}>
        {prefix}{eloChange.toFixed(2)}
      </span>
    );
  };

  if (data.length === 0) {
    return (
      <div className="bg-white/90 dark:bg-slate-800/80 backdrop-blur-sm rounded-xl border border-zinc-200 dark:border-slate-700 p-8 shadow-sm text-center">
        <p className="text-slate-600 dark:text-slate-400">No games match the current filters.</p>
      </div>
    );
  }

  return (
    <div className="bg-white/90 dark:bg-slate-800/80 backdrop-blur-sm rounded-xl border border-zinc-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-zinc-200 dark:border-slate-700">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Game Details
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Showing {startRow.toLocaleString()}-{endRow.toLocaleString()} of {sortedData.length.toLocaleString()} games
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600 dark:text-slate-400">Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              className="px-2 py-1 text-sm border border-zinc-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 dark:bg-slate-700/50">
            <tr>
              <th 
                className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600/50 transition-colors"
                onClick={() => handleSort('playerName')}
              >
                Player Name {getSortIcon('playerName')}
              </th>
              <th 
                className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600/50 transition-colors"
                onClick={() => handleSort('elo')}
              >
                Elo {getSortIcon('elo')}
              </th>
              <th 
                className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600/50 transition-colors"
                onClick={() => handleSort('eloChange')}
              >
                Elo Change {getSortIcon('eloChange')}
              </th>
              <th 
                className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600/50 transition-colors"
                onClick={() => handleSort('finalScore')}
              >
                Final Score {getSortIcon('finalScore')}
              </th>
              <th 
                className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600/50 transition-colors"
                onClick={() => handleSort('position')}
              >
                Position {getSortIcon('position')}
              </th>
              <th 
                className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600/50 transition-colors"
                onClick={() => handleSort('playerCount')}
              >
                Players {getSortIcon('playerCount')}
              </th>
              <th 
                className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600/50 transition-colors"
                onClick={() => handleSort('map')}
              >
                Map {getSortIcon('map')}
              </th>
              <th 
                className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600/50 transition-colors"
                onClick={() => handleSort('gameMode')}
              >
                Game Mode {getSortIcon('gameMode')}
              </th>
              <th 
                className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600/50 transition-colors"
                onClick={() => handleSort('generations')}
              >
                Generations {getSortIcon('generations')}
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
            {paginatedData.map((row, index) => (
              <tr 
                key={`${row.tableId}-${row.playerId}-${index}`}
                onClick={() => window.open(`https://boardgamearena.com/table?table=${row.tableId}`, '_blank')}
                className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
              >
                <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-slate-100">
                  {row.playerName}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                  {row.elo?.toFixed(0) || 'N/A'}
                </td>
                <td className="px-4 py-3 text-sm">
                  {getEloChangeDisplay(row.eloChange)}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                  {row.finalScore?.toFixed(0) || 'N/A'}
                </td>
                <td className="px-4 py-3 text-sm">
                  {getPositionDisplay(row.position)}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                  {row.playerCount ? `${row.playerCount}P` : 'N/A'}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                  {row.map || 'N/A'}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                  {row.gameMode || 'N/A'}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                  {row.generations || 'N/A'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="p-4 border-t border-zinc-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-600 dark:text-slate-400">
              Page {currentPage} of {totalPages}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(1)}
                disabled={currentPage === 1}
              >
                First
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              
              {/* Page numbers */}
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  
                  return (
                    <Button
                      key={pageNum}
                      variant={currentPage === pageNum ? "default" : "outline"}
                      size="sm"
                      onClick={() => handlePageChange(pageNum)}
                      className="w-8 h-8 p-0"
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(totalPages)}
                disabled={currentPage === totalPages}
              >
                Last
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
