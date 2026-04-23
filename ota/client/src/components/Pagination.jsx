import React from 'react';

export default function Pagination({ page, total, limit, onPageChange }) {
  const totalPages = Math.ceil(total / limit);
  if (totalPages <= 1) return null;

  const pages = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="flex items-center justify-between mt-4">
      <p className="text-sm text-gray-600">
        Showing {Math.min((page - 1) * limit + 1, total)}–{Math.min(page * limit, total)} of {total}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="px-3 py-1.5 text-sm rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50 disabled:cursor-not-allowed"
        >
          ‹ Prev
        </button>
        {start > 1 && (
          <>
            <button onClick={() => onPageChange(1)} className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50">1</button>
            {start > 2 && <span className="px-2 text-gray-400">…</span>}
          </>
        )}
        {pages.map(p => (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`px-3 py-1.5 text-sm rounded border transition-colors ${
              p === page
                ? 'bg-primary text-white border-primary'
                : 'border-gray-300 hover:bg-gray-50'
            }`}
          >
            {p}
          </button>
        ))}
        {end < totalPages && (
          <>
            {end < totalPages - 1 && <span className="px-2 text-gray-400">…</span>}
            <button onClick={() => onPageChange(totalPages)} className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50">{totalPages}</button>
          </>
        )}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="px-3 py-1.5 text-sm rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50 disabled:cursor-not-allowed"
        >
          Next ›
        </button>
      </div>
    </div>
  );
}
