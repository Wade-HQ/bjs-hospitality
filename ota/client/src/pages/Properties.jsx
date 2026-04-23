import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/index.js';

const TYPE_COLORS = {
  lodge:   'bg-teal/10 text-teal',
  camp:    'bg-gold/10 text-gold',
  resort:  'bg-blue-100 text-blue-700',
  villa:   'bg-purple-100 text-purple-700',
};

export default function Properties() {
  const [searchParams] = useSearchParams();
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/api/public/properties')
      .then(res => setProperties(res.data || []))
      .catch(() => setError('Failed to load properties.'))
      .finally(() => setLoading(false));
  }, []);

  const destination = searchParams.get('destination') || '';

  const filtered = properties.filter(p => {
    const q = search.toLowerCase();
    const matchesSearch = !q || p.name?.toLowerCase().includes(q) || p.country?.toLowerCase().includes(q);
    const matchesDest = !destination || p.country?.toLowerCase().includes(destination.toLowerCase());
    return matchesSearch && matchesDest;
  });

  const getMinRate = (property) => {
    if (!property.room_types?.length) return null;
    const rates = property.room_types.map(r => Number(r.base_rate)).filter(Boolean);
    return rates.length ? Math.min(...rates) : null;
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-primary py-12 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <Link to="/" className="text-white/60 hover:text-white text-sm transition-colors">Home</Link>
            <span className="text-white/30">/</span>
            <span className="text-white text-sm">Properties</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Our Properties</h1>
          <p className="text-white/60">Discover our collection of exceptional safari destinations</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Search */}
        <div className="mb-8">
          <input
            type="text"
            placeholder="Search by property name or country..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full max-w-md border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
          />
          {destination && (
            <p className="text-sm text-gray-500 mt-2">
              Showing results in: <span className="font-medium text-primary">{destination}</span>
              <Link to="/properties" className="ml-2 text-teal hover:underline text-xs">Clear</Link>
            </p>
          )}
        </div>

        {loading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-2xl overflow-hidden bg-white border border-gray-200">
                <div className="h-48 bg-gray-200 animate-pulse" />
                <div className="p-5 space-y-3">
                  <div className="h-5 bg-gray-200 rounded animate-pulse w-2/3" />
                  <div className="h-4 bg-gray-100 rounded animate-pulse" />
                  <div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-center">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-5xl mb-4">🏕️</div>
            <p className="font-medium text-lg mb-2">No properties found</p>
            <p className="text-sm">Try adjusting your search</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(property => {
              const minRate = getMinRate(property);
              const typeStyle = TYPE_COLORS[property.property_type?.toLowerCase()] || 'bg-gray-100 text-gray-600';
              return (
                <div key={property.id} className="bg-white rounded-2xl overflow-hidden border border-gray-200 shadow-sm hover:shadow-lg transition-all hover:-translate-y-0.5">
                  <div
                    className="h-48 flex items-end p-5"
                    style={{ background: 'linear-gradient(135deg, #0D1B2A 0%, #1B5E7B 100%)' }}
                  >
                    <div>
                      {property.property_type && (
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full mb-2 inline-block ${typeStyle}`}>
                          {property.property_type}
                        </span>
                      )}
                      <h3 className="text-white text-xl font-bold leading-snug">{property.name}</h3>
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="flex items-center gap-1.5 text-gray-400 text-xs mb-3">
                      <span>📍</span>
                      <span>{property.country}</span>
                    </div>
                    <p className="text-gray-600 text-sm mb-4 line-clamp-2 leading-relaxed">
                      {property.description || 'Experience the magic of the African wilderness at this exceptional property.'}
                    </p>
                    {property.room_types?.length > 0 && (
                      <p className="text-xs text-gray-400 mb-3">
                        {property.room_types.length} room type{property.room_types.length !== 1 ? 's' : ''}
                      </p>
                    )}
                    <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                      {minRate ? (
                        <div>
                          <span className="text-gray-400 text-xs">from </span>
                          <span className="text-primary font-bold">
                            {property.currency || 'ZAR'} {Number(minRate).toLocaleString()}
                          </span>
                          <span className="text-gray-400 text-xs">/night</span>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">Contact for rates</span>
                      )}
                      <Link
                        to={`/properties/${property.slug}`}
                        className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                        View & Book
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
