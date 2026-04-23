import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/index.js';
import Pagination from '../../components/Pagination.jsx';

export default function Guests() {
  const [guests, setGuests] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/api/guests', { params: { page, limit: 25, search } }).then(r => { setGuests(r.data.guests || []); setTotal(r.data.total || 0); });
  }, [page, search]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary mb-6">Guests</h1>
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-100">
          <input
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full max-w-xs"
            placeholder="Search name, email, phone…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
              <tr>{['Name','Email','Phone','Nationality','VIP','Bookings'].map(h => <th key={h} className="px-4 py-3 text-left">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {guests.map(g => (
                <tr key={g.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link to={`/dashboard/guests/${g.id}`} className="text-teal font-medium hover:underline">
                      {g.first_name} {g.last_name}
                      {g.vip_flag ? <span className="ml-2 text-xs bg-gold/20 text-gold px-1.5 py-0.5 rounded-full">VIP</span> : null}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{g.email || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{g.phone || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{g.nationality || '—'}</td>
                  <td className="px-4 py-3">{g.vip_flag ? '★' : ''}</td>
                  <td className="px-4 py-3 text-gray-500">{g.booking_count || 0}</td>
                </tr>
              ))}
              {guests.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">No guests found</td></tr>}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} limit={25} onPage={setPage} />
      </div>
    </div>
  );
}
