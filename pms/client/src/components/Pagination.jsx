import React from 'react';

export default function Pagination({ page, total, limit, onPage }) {
  const pages = Math.ceil(total / limit);
  if (pages <= 1) return null;
  const start = Math.max(1, page - 2);
  const end = Math.min(pages, page + 2);
  const nums = Array.from({ length: end - start + 1 }, (_, i) => start + i);
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
      <span>Showing {((page-1)*limit)+1}–{Math.min(page*limit,total)} of {total}</span>
      <div className="flex gap-1">
        <button onClick={() => onPage(page-1)} disabled={page<=1} className="px-3 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">←</button>
        {nums.map(n => (
          <button key={n} onClick={() => onPage(n)} className={`px-3 py-1 rounded border ${n===page ? 'bg-primary text-white border-primary' : 'border-gray-200 hover:bg-gray-50'}`}>{n}</button>
        ))}
        <button onClick={() => onPage(page+1)} disabled={page>=pages} className="px-3 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">→</button>
      </div>
    </div>
  );
}
