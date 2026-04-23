import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api/index.js';

const TESTIMONIALS = [
  {
    quote: "An absolutely unforgettable experience. The safari exceeded all our expectations — breathtaking wildlife and impeccable service from start to finish.",
    author: "Sarah M.",
    location: "United Kingdom",
  },
  {
    quote: "Sun Safari Destinations made planning our honeymoon completely effortless. Every detail was perfect and the properties were stunning.",
    author: "James & Priya R.",
    location: "Australia",
  },
  {
    quote: "We've travelled extensively across Africa but nothing compares to what Sun Safari curated for us. We'll be back for certain.",
    author: "Klaus H.",
    location: "Germany",
  },
];

export default function Home() {
  const navigate = useNavigate();
  const [properties, setProperties] = useState([]);
  const [loadingProps, setLoadingProps] = useState(true);

  const [destination, setDestination] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [guests, setGuests] = useState(2);

  useEffect(() => {
    api.get('/api/public/properties')
      .then(res => setProperties(res.data?.slice(0, 2) || []))
      .catch(() => setProperties([]))
      .finally(() => setLoadingProps(false));
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (destination) params.set('destination', destination);
    if (checkIn) params.set('checkIn', checkIn);
    if (checkOut) params.set('checkOut', checkOut);
    if (guests) params.set('guests', guests);
    navigate(`/properties?${params.toString()}`);
  };

  const getMinRate = (property) => {
    if (!property.room_types?.length) return null;
    const rates = property.room_types.map(r => Number(r.base_rate)).filter(Boolean);
    return rates.length ? Math.min(...rates) : null;
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-8 py-5">
        <div className="text-white font-bold text-xl">
          <span className="text-gold">Sun Safari</span> Destinations
        </div>
        <div className="flex items-center gap-6">
          <Link to="/properties" className="text-white/80 hover:text-white text-sm transition-colors">Properties</Link>
          <Link to="/booking/lookup" className="text-white/80 hover:text-white text-sm transition-colors">My Booking</Link>
          <Link to="/login" className="bg-gold text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gold/90 transition-colors">Staff Login</Link>
        </div>
      </nav>

      {/* Hero */}
      <div
        className="relative min-h-screen flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #0D1B2A 0%, #1B5E7B 60%, #0D1B2A 100%)' }}
      >
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: 'radial-gradient(circle at 20% 50%, #C8922A 0%, transparent 50%), radial-gradient(circle at 80% 20%, #1B5E7B 0%, transparent 50%)'
        }} />

        <div className="relative z-10 text-center max-w-4xl mx-auto px-6 pt-24 pb-16">
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-4 leading-tight">
            Discover Southern Africa
          </h1>
          <p className="text-xl md:text-2xl text-gold italic font-light mb-12">
            Extraordinary journeys through untamed wilderness
          </p>

          {/* Search Bar */}
          <form onSubmit={handleSearch} className="bg-white rounded-2xl shadow-2xl p-4 md:p-6 flex flex-col md:flex-row gap-3">
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-semibold text-gray-500 mb-1 text-left">DESTINATION</label>
              <select
                value={destination}
                onChange={e => setDestination(e.target.value)}
                className="w-full text-sm text-gray-800 border-0 outline-none bg-transparent"
              >
                <option value="">All Destinations</option>
                <option value="South Africa">South Africa</option>
                <option value="Mozambique">Mozambique</option>
                <option value="Zimbabwe">Zimbabwe</option>
                <option value="Botswana">Botswana</option>
                <option value="Zambia">Zambia</option>
              </select>
            </div>
            <div className="h-px md:h-auto md:w-px bg-gray-200" />
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-semibold text-gray-500 mb-1 text-left">CHECK-IN</label>
              <input
                type="date"
                value={checkIn}
                onChange={e => setCheckIn(e.target.value)}
                className="w-full text-sm text-gray-800 border-0 outline-none bg-transparent"
              />
            </div>
            <div className="h-px md:h-auto md:w-px bg-gray-200" />
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-semibold text-gray-500 mb-1 text-left">CHECK-OUT</label>
              <input
                type="date"
                value={checkOut}
                onChange={e => setCheckOut(e.target.value)}
                className="w-full text-sm text-gray-800 border-0 outline-none bg-transparent"
              />
            </div>
            <div className="h-px md:h-auto md:w-px bg-gray-200" />
            <div className="w-full md:w-28">
              <label className="block text-xs font-semibold text-gray-500 mb-1 text-left">GUESTS</label>
              <input
                type="number"
                min="1"
                max="20"
                value={guests}
                onChange={e => setGuests(e.target.value)}
                className="w-full text-sm text-gray-800 border-0 outline-none bg-transparent"
              />
            </div>
            <button
              type="submit"
              className="bg-gold hover:bg-gold/90 text-white font-semibold px-8 py-3 rounded-xl transition-colors whitespace-nowrap"
            >
              Search
            </button>
          </form>
        </div>
      </div>

      {/* Featured Properties */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-primary mb-3">Featured Properties</h2>
          <p className="text-gray-500 text-lg">Handpicked lodges and camps in prime wilderness locations</p>
        </div>

        {loadingProps ? (
          <div className="grid md:grid-cols-2 gap-8">
            {[0, 1].map(i => (
              <div key={i} className="rounded-2xl overflow-hidden border border-gray-200">
                <div className="h-56 bg-gray-200 animate-pulse" />
                <div className="p-6 space-y-3">
                  <div className="h-5 bg-gray-200 rounded animate-pulse w-2/3" />
                  <div className="h-4 bg-gray-100 rounded animate-pulse w-full" />
                  <div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : properties.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            <div className="text-5xl mb-4">🏕️</div>
            <p>Properties coming soon</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-8">
            {properties.map(property => {
              const minRate = getMinRate(property);
              return (
                <div key={property.id} className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm hover:shadow-lg transition-shadow">
                  <div
                    className="h-56 flex items-end p-6"
                    style={{ background: 'linear-gradient(135deg, #0D1B2A, #1B5E7B)' }}
                  >
                    <div>
                      <span className="bg-gold text-white text-xs font-semibold px-3 py-1 rounded-full mb-2 inline-block">
                        {property.property_type || 'Lodge'}
                      </span>
                      <h3 className="text-white text-2xl font-bold">{property.name}</h3>
                      <p className="text-white/70 text-sm">{property.country}</p>
                    </div>
                  </div>
                  <div className="p-6">
                    <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                      {property.description || 'Experience the magic of the African wilderness at this exceptional property.'}
                    </p>
                    <div className="flex items-center justify-between">
                      <div>
                        {minRate && (
                          <div>
                            <span className="text-gray-400 text-xs">from </span>
                            <span className="text-primary font-bold text-lg">
                              {property.currency || 'ZAR'} {Number(minRate).toLocaleString()}
                            </span>
                            <span className="text-gray-400 text-xs"> /night</span>
                          </div>
                        )}
                      </div>
                      <Link
                        to={`/properties/${property.slug}`}
                        className="bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
                      >
                        Book Now
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="text-center mt-10">
          <Link to="/properties" className="border-2 border-primary text-primary hover:bg-primary hover:text-white font-semibold px-8 py-3 rounded-xl transition-colors inline-block">
            View All Properties
          </Link>
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-primary py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-3">Guest Stories</h2>
            <p className="text-white/60">What our guests say about their experiences</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {TESTIMONIALS.map((t, i) => (
              <div key={i} className="bg-white/5 rounded-2xl p-8 border border-white/10">
                <div className="text-gold text-5xl font-serif leading-none mb-4">"</div>
                <p className="text-white/80 text-sm leading-relaxed mb-6">{t.quote}</p>
                <div>
                  <div className="text-gold font-semibold text-sm">{t.author}</div>
                  <div className="text-white/50 text-xs">{t.location}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-primary border-t border-white/10 py-12 px-6 text-center">
        <div className="max-w-4xl mx-auto">
          <div className="text-gold font-bold text-2xl mb-3">Sun Safari Destinations</div>
          <p className="text-white/50 text-sm mb-6">Extraordinary safari experiences across Southern Africa</p>
          <div className="flex flex-wrap justify-center gap-6 text-white/40 text-sm mb-6">
            <span>office@sunsafaridestinations.co.za</span>
            <span>|</span>
            <span>South Africa</span>
          </div>
          <div className="flex justify-center gap-4 mb-8">
            <a href="#" className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center text-white/60 hover:bg-white/20 transition-colors text-sm">f</a>
            <a href="#" className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center text-white/60 hover:bg-white/20 transition-colors text-sm">in</a>
            <a href="#" className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center text-white/60 hover:bg-white/20 transition-colors text-sm">ig</a>
          </div>
          <div className="flex justify-center gap-6 text-white/30 text-xs">
            <Link to="/properties" className="hover:text-white/60 transition-colors">Properties</Link>
            <Link to="/booking/lookup" className="hover:text-white/60 transition-colors">Manage Booking</Link>
            <Link to="/login" className="hover:text-white/60 transition-colors">Staff Login</Link>
          </div>
          <p className="text-white/20 text-xs mt-6">© {new Date().getFullYear()} Sun Safari Destinations. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
