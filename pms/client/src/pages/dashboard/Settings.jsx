import React, { useState, useEffect } from 'react';
import api from '../../api/index.js';
import Modal from '../../components/Modal.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';
import { useProperty } from '../../contexts/PropertyContext.jsx';

const STATUS_COLORS = {
  available:   'bg-emerald-100 text-emerald-700',
  occupied:    'bg-blue-100 text-blue-700',
  maintenance: 'bg-amber-100 text-amber-700',
  blocked:     'bg-red-100 text-red-700',
};

const BED_OPTIONS = [
  '1 King Bed',
  '2 King Beds',
  '2 Singles / Twin',
  '3 Singles',
  '4 Singles',
  '1 Sofa Bed',
  'Bunk Bed (sleeps 2)',
  '2 Bunk Beds (sleeps 4)',
  '3 Bunk Beds (sleeps 6)',
  '1 King + 1 Single',
  '1 King + Sofa Bed',
  '1 King + Bunk Bed',
  '2 Singles + Sofa Bed',
  '2 Singles + Bunk Bed',
];

const AMENITIES = [
  'WiFi', 'Air Conditioning', 'Ceiling Fan', 'Private Bathroom (En Suite)',
  'Outdoor Shower', 'Private Deck / Balcony', 'Sea View', 'Bush View',
  'Kitchenette', 'Mini-Fridge', 'Coffee & Tea', 'Safe',
  'Mosquito Net', 'Braai / BBQ', 'Fire Pit', 'Pool Access',
];

const EMPTY_ROOM = {
  room_number: '', name: '', room_type_id: '', floor: '',
  status: 'available', max_occupancy: '', max_adults: '',
  bed_config: '', bed_config_alt: '', show_online: true, notes: '',
  description: '', amenities_json: '[]', wheelchair_accessible: false, bedrooms: 1,
};

const EMPTY_RT = { name: '' };

function RoomTypeRateRow({ rt, intl, sadc, currency, onSave }) {
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({});

  const startEdit = (region, rate) => {
    setEditing(region);
    setDraft({
      rate_per_person: rate.rate_per_person ?? 0,
      single_supplement_multiplier: rate.single_supplement_multiplier ?? 1.5,
      children_pct: rate.children_pct ?? 50,
      is_online: rate.is_online !== 0,
      is_sto: rate.is_sto !== 0,
      is_agent: rate.is_agent !== 0,
      is_ota: rate.is_ota !== 0,
    });
  };

  const save = () => {
    onSave(editing, {
      ...draft,
      is_online: draft.is_online ? 1 : 0,
      is_sto: draft.is_sto ? 1 : 0,
      is_agent: draft.is_agent ? 1 : 0,
      is_ota: draft.is_ota ? 1 : 0,
    });
    setEditing(null);
  };

  const visibilityLabel = (rate) => {
    const flags = [rate.is_online && 'Online', rate.is_sto && 'STO', rate.is_agent && 'Agent', rate.is_ota && 'OTA'].filter(Boolean);
    return flags.length ? flags.join(' · ') : 'Hidden';
  };

  return (
    <div className="px-6 py-5">
      <div className="font-semibold text-gray-800 mb-3">{rt.name}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[['international', 'International', intl], ['sadc', 'SADC', sadc]].map(([region, label, rate]) => (
          <div key={region} className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
              {editing === region ? (
                <div className="flex gap-2">
                  <button onClick={save} className="text-xs bg-gold text-white px-2 py-1 rounded">Save</button>
                  <button onClick={() => setEditing(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                </div>
              ) : (
                <button onClick={() => startEdit(region, rate)} className="text-xs text-teal hover:underline">Edit</button>
              )}
            </div>
            {editing === region ? (
              <div className="space-y-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Rate/person/night ({currency})</label>
                  <input type="number" step="0.01" value={draft.rate_per_person}
                    onChange={e => setDraft(p => ({ ...p, rate_per_person: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">Single supplement ×</label>
                    <input type="number" step="0.1" value={draft.single_supplement_multiplier}
                      onChange={e => setDraft(p => ({ ...p, single_supplement_multiplier: e.target.value }))}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">Children % of adult</label>
                    <input type="number" step="1" min="0" max="100" value={draft.children_pct}
                      onChange={e => setDraft(p => ({ ...p, children_pct: e.target.value }))}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 pt-1">
                  {[['is_online','Online'],['is_sto','STO'],['is_agent','Agent'],['is_ota','OTA']].map(([k,l]) => (
                    <label key={k} className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={!!draft[k]} onChange={e => setDraft(p => ({ ...p, [k]: e.target.checked }))} />
                      {l}
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <div className="text-lg font-bold text-primary">{currency} {Number(rate.rate_per_person || 0).toLocaleString()}<span className="text-xs text-gray-400 font-normal">/person/night</span></div>
                <div className="text-xs text-gray-400 mt-1">Single: ×{rate.single_supplement_multiplier ?? 1.5} · Children: {rate.children_pct ?? 50}%</div>
                <div className="text-xs text-gray-400 mt-0.5">{visibilityLabel(rate)}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Settings() {
  const { property, reload: reloadProperty } = useProperty();
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [roomTypes, setRoomTypes] = useState([]);
  const [roomModal, setRoomModal] = useState(false);
  const [roomForm, setRoomForm] = useState(EMPTY_ROOM);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [rtModal, setRtModal] = useState(false);
  const [rtForm, setRtForm] = useState(EMPTY_RT);
  const [rtDeleteConfirm, setRtDeleteConfirm] = useState(null);
  const [activeSection, setActiveSection] = useState('rooms');
  const { addToast } = useToast();
  const [mealPackages, setMealPackages] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [roomTypeRates, setRoomTypeRates] = useState({});
  const [mealModal, setMealModal] = useState(false);
  const [mealForm, setMealForm] = useState({ name: '', price_per_person: '', is_online: true, is_sto: true, is_agent: true, is_ota: true });
  const [seasonModal, setSeasonModal] = useState(false);
  const [seasonForm, setSeasonForm] = useState({ name: '', pct_change: '', start_date: '', end_date: '' });

  const load = () => {
    api.get('/api/rooms').then(r => setRooms(r.data?.rooms || []));
    api.get('/api/room-types').then(r => {
      const rts = r.data?.room_types || [];
      setRoomTypes(rts);
      Promise.all(rts.map(rt => api.get(`/api/room-types/${rt.id}/rates`)))
        .then(results => {
          const ratesMap = {};
          results.forEach((res, i) => { ratesMap[rts[i].id] = res.data?.rates || {}; });
          setRoomTypeRates(ratesMap);
        });
    });
    api.get('/api/meal-packages').then(r => setMealPackages(r.data?.meal_packages || []));
    api.get('/api/seasonal-adjustments').then(r => setSeasons(r.data?.seasonal_adjustments || []));
  };

  useEffect(() => {
    if (property) setForm(property);
    load();
  }, [property]);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/api/settings', form);
      addToast('Settings saved');
      reloadProperty();
    } catch (e) { addToast(e.response?.data?.error || 'Error saving', 'error'); }
    finally { setSaving(false); }
  };

  // ── Room CRUD ─────────────────────────────────────────────────────────────
  const openAddRoom = (roomTypeId = '') => {
    setRoomForm({ ...EMPTY_ROOM, room_type_id: String(roomTypeId) });
    setRoomModal(true);
  };
  const openEditRoom = (r) => {
    setRoomForm({
      ...EMPTY_ROOM, ...r,
      room_type_id: String(r.room_type_id || ''),
      show_online: r.show_online !== 0,
      wheelchair_accessible: r.wheelchair_accessible === 1 || r.wheelchair_accessible === true,
      description: r.description || '',
      amenities_json: r.amenities_json || '[]',
    });
    setRoomModal(true);
  };
  const duplicateRoom = (r) => {
    const { id, created_at, ...rest } = r;
    const suggestedName = (rest.name || rest.room_number || '') + ' (Copy)';
    setRoomForm({ ...EMPTY_ROOM, ...rest, name: suggestedName, room_type_id: String(rest.room_type_id || '') });
    setRoomModal(true);
  };
  const saveRoom = async () => {
    const payload = {
      ...roomForm,
      room_number: roomForm.name || roomForm.room_number,
      room_type_id: roomForm.room_type_id || null,
      max_occupancy: roomForm.max_occupancy !== '' ? Number(roomForm.max_occupancy) : null,
      max_adults: roomForm.max_adults !== '' ? Number(roomForm.max_adults) : null,
      show_online: roomForm.show_online ? 1 : 0,
      wheelchair_accessible: roomForm.wheelchair_accessible ? 1 : 0,
      bedrooms: Number(roomForm.bedrooms) || 1,
      description: roomForm.description || null,
      amenities_json: roomForm.amenities_json || '[]',
    };
    try {
      if (roomForm.id) await api.put(`/api/rooms/${roomForm.id}`, payload);
      else await api.post('/api/rooms', payload);
      addToast(roomForm.id ? 'Room updated' : 'Room added');
      setRoomModal(false);
      load();
    } catch (e) { addToast(e.response?.data?.error || 'Error', 'error'); }
  };
  const deleteRoom = async (room) => {
    try {
      await api.delete(`/api/rooms/${room.id}`);
      addToast('Room deleted');
      setDeleteConfirm(null);
      load();
    } catch (e) {
      addToast(e.response?.data?.error || 'Cannot delete room with active bookings', 'error');
      setDeleteConfirm(null);
    }
  };

  // ── Room Type CRUD ────────────────────────────────────────────────────────
  const openAddRoomType = () => { setRtForm(EMPTY_RT); setRtModal(true); };
  const openEditRoomType = (rt) => { setRtForm(rt); setRtModal(true); };
  const saveRoomType = async () => {
    try {
      if (rtForm.id) await api.put(`/api/room-types/${rtForm.id}`, rtForm);
      else await api.post('/api/room-types', rtForm);
      addToast('Room type saved');
      setRtModal(false);
      load();
    } catch (e) { addToast(e.response?.data?.error || 'Error', 'error'); }
  };
  const deleteRoomType = async (rt) => {
    try {
      await api.delete(`/api/room-types/${rt.id}`);
      addToast('Room type deleted');
      setRtDeleteConfirm(null);
      load();
    } catch (e) {
      addToast(e.response?.data?.error || 'Cannot delete — rooms still assigned', 'error');
      setRtDeleteConfirm(null);
    }
  };

  const saveRoomTypeRate = async (roomTypeId, region, data) => {
    try {
      await api.put(`/api/room-types/${roomTypeId}/rates/${region}`, data);
      addToast('Rate saved');
      load();
    } catch (e) { addToast(e.response?.data?.error || 'Error saving rate', 'error'); }
  };

  const saveMealPackage = async () => {
    try {
      if (mealForm.id) await api.put(`/api/meal-packages/${mealForm.id}`, mealForm);
      else await api.post('/api/meal-packages', mealForm);
      addToast('Meal package saved');
      setMealModal(false);
      load();
    } catch (e) { addToast(e.response?.data?.error || 'Error', 'error'); }
  };

  const deleteMealPackage = async (id) => {
    if (!window.confirm('Delete this meal package?')) return;
    try {
      await api.delete(`/api/meal-packages/${id}`);
      addToast('Deleted');
      load();
    } catch (e) { addToast(e.response?.data?.error || 'Error', 'error'); }
  };

  const saveSeason = async () => {
    try {
      if (seasonForm.id) await api.put(`/api/seasonal-adjustments/${seasonForm.id}`, seasonForm);
      else await api.post('/api/seasonal-adjustments', seasonForm);
      addToast('Season saved');
      setSeasonModal(false);
      load();
    } catch (e) { addToast(e.response?.data?.error || 'Error', 'error'); }
  };

  const deleteSeason = async (id) => {
    if (!window.confirm('Delete this seasonal adjustment?')) return;
    try {
      await api.delete(`/api/seasonal-adjustments/${id}`);
      addToast('Deleted');
      load();
    } catch (e) { addToast(e.response?.data?.error || 'Error', 'error'); }
  };

  // ── Amenities helpers ─────────────────────────────────────────────────────
  const selectedAmenities = (() => {
    try { return JSON.parse(roomForm.amenities_json || '[]'); } catch { return []; }
  })();

  const toggleAmenity = (amenity) => {
    const current = (() => {
      try { return JSON.parse(roomForm.amenities_json || '[]'); } catch { return []; }
    })();
    const next = current.includes(amenity)
      ? current.filter(a => a !== amenity)
      : [...current, amenity];
    setRoomForm(p => ({ ...p, amenities_json: JSON.stringify(next) }));
  };

  const propSections = [
    { title: 'Property Info', fields: [
      { k: 'name', l: 'Property Name' }, { k: 'address', l: 'Address' },
      { k: 'country', l: 'Country' }, { k: 'timezone', l: 'Timezone' },
      { k: 'contact_email', l: 'Contact Email' }, { k: 'contact_phone', l: 'Phone' },
    ]},
    { title: 'Finance', fields: [
      { k: 'currency', l: 'Currency' }, { k: 'tax_label', l: 'Tax Label' },
      { k: 'tax_rate', l: 'Tax Rate %', t: 'number' }, { k: 'invoice_prefix', l: 'Invoice Prefix' },
      { k: 'vat_number', l: 'VAT / IVA Number' }, { k: 'payment_instructions', l: 'Payment Instructions' },
    ]},
    { title: 'Email (SMTP)', fields: [
      { k: 'smtp_host', l: 'SMTP Host' }, { k: 'smtp_port', l: 'Port', t: 'number' },
      { k: 'smtp_user', l: 'SMTP User' }, { k: 'smtp_pass', l: 'SMTP Password', t: 'password' },
      { k: 'smtp_from', l: 'From Address' },
    ]},
  ];

  if (!property) return <div className="p-12 text-center text-gray-400">Loading…</div>;

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-2xl font-bold text-primary mb-1">Settings</h1>
      <p className="text-gray-400 text-sm mb-6">{property.name}</p>

      {/* Section tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit flex-wrap">
        {[['rooms', '🛏 Rooms & Types'], ['rates', '💲 Rates'], ['property', '🏨 Property'], ['finance', '💰 Finance'], ['email', '📧 Email']].map(([k, l]) => (
          <button key={k} onClick={() => setActiveSection(k)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeSection === k ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* ── ROOMS & TYPES ── */}
      {activeSection === 'rooms' && (
        <div className="space-y-6">

          {/* Room Types header */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-semibold text-gray-800">Room Types &amp; Rooms</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Room types are categories (e.g. Chalet, Tent). Individual rooms belong to a type.
                </p>
              </div>
              <button onClick={openAddRoomType}
                className="text-sm bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary/90">
                + Add Room Type
              </button>
            </div>

            {roomTypes.length === 0 ? (
              <div className="px-6 py-10 text-center text-gray-400 text-sm">
                No room types yet. Add one to get started.
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {roomTypes.map(rt => {
                  const rtRooms = rooms.filter(r => r.room_type_id === rt.id);
                  return (
                    <div key={rt.id} className="px-6 py-5">
                      {/* Room type header row */}
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="font-semibold text-gray-800 text-base">{rt.name}</span>
                            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                              {rtRooms.length} room{rtRooms.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button onClick={() => openAddRoom(rt.id)}
                            className="text-xs border border-gold text-gold px-3 py-1.5 rounded-lg hover:bg-gold hover:text-white transition-colors">
                            + Add Room
                          </button>
                          <button onClick={() => openEditRoomType(rt)}
                            className="text-xs border border-gray-200 text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-50">
                            Edit Type
                          </button>
                          <button onClick={() => setRtDeleteConfirm(rt)}
                            className="text-xs border border-red-200 text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-50">
                            Delete
                          </button>
                        </div>
                      </div>

                      {/* Rooms grid */}
                      {rtRooms.length === 0 ? (
                        <p className="text-xs text-gray-400 italic pl-1">No rooms yet — click "+ Add Room" to add one.</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {rtRooms.map(r => (
                            <div key={r.id}
                              className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex flex-col gap-1.5">
                              {/* Room name + status */}
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="font-semibold text-gray-800 text-sm truncate">
                                    {r.name || r.room_number}
                                  </span>
                                  {r.wheelchair_accessible === 1 && (
                                    <span className="text-xs flex-shrink-0" title="Wheelchair Accessible">♿</span>
                                  )}
                                </div>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_COLORS[r.status] || ''}`}>
                                  {r.status}
                                </span>
                              </div>

                              {/* Description snippet */}
                              {r.description && (
                                <p className="text-xs text-gray-400 truncate">{r.description}</p>
                              )}

                              {/* Room details */}
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                                {r.bedrooms > 1 && (
                                  <span>🛏 {r.bedrooms} bed</span>
                                )}
                                {(r.max_occupancy || r.max_adults) && (
                                  <span>
                                    👥 {r.max_occupancy ? `${r.max_occupancy} guests` : ''}
                                    {r.max_occupancy && r.max_adults ? ' · ' : ''}
                                    {r.max_adults ? `${r.max_adults} adults` : ''}
                                  </span>
                                )}
                                {r.bed_config && <span>🛏 {r.bed_config}</span>}
                                {r.bed_config_alt && <span className="text-gray-400">Alt: {r.bed_config_alt}</span>}
                                {r.floor && <span>📍 {r.floor}</span>}
                              </div>

                              {/* Online badge + actions */}
                              <div className="flex items-center justify-between mt-1">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.show_online !== 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
                                  {r.show_online !== 0 ? '🌐 Online' : '🚫 Hidden'}
                                </span>
                                <div className="flex gap-2">
                                  <button onClick={() => openEditRoom(r)}
                                    className="text-xs text-teal hover:underline font-medium">
                                    Edit
                                  </button>
                                  <button onClick={() => duplicateRoom(r)}
                                    className="text-xs text-gray-400 hover:text-gray-600 hover:underline">
                                    Duplicate
                                  </button>
                                  <button onClick={() => setDeleteConfirm(r)}
                                    className="text-xs text-red-400 hover:text-red-600 hover:underline">
                                    Delete
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Unassigned rooms */}
          {rooms.filter(r => !r.room_type_id).length > 0 && (
            <div className="bg-white rounded-xl border border-amber-200">
              <div className="px-6 py-4 border-b border-amber-100">
                <h2 className="font-semibold text-amber-700">⚠ Unassigned Rooms</h2>
                <p className="text-xs text-amber-500 mt-0.5">These rooms have no room type — assign one via Edit</p>
              </div>
              <div className="px-6 py-4 flex flex-wrap gap-2">
                {rooms.filter(r => !r.room_type_id).map(r => (
                  <div key={r.id} className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                    <span className="text-sm font-medium">{r.name || r.room_number}</span>
                    <button onClick={() => openEditRoom(r)} className="text-xs text-teal hover:underline">Edit</button>
                    <button onClick={() => setDeleteConfirm(r)} className="text-xs text-red-400 hover:underline">Delete</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── RATES ── */}
      {activeSection === 'rates' && (
        <div className="space-y-6">

          {/* Room Type Base Rates */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">Base Rates by Room Type</h2>
              <p className="text-xs text-gray-400 mt-0.5">Per person per night. International and SADC rates apply separately.</p>
            </div>
            {roomTypes.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-400 text-sm">No room types yet.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {roomTypes.map(rt => {
                  const rates = roomTypeRates[rt.id] || {};
                  const intl = rates.international || {};
                  const sadc = rates.sadc || {};
                  return (
                    <RoomTypeRateRow
                      key={rt.id}
                      rt={rt}
                      intl={intl}
                      sadc={sadc}
                      currency={property?.currency || 'ZAR'}
                      onSave={(region, data) => saveRoomTypeRate(rt.id, region, data)}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Meal Packages */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-semibold text-gray-800">Meal Packages</h2>
                <p className="text-xs text-gray-400 mt-0.5">Fixed per person per night — not affected by seasonal adjustments.</p>
              </div>
              <button onClick={() => { setMealForm({ name: '', price_per_person: '', is_online: true, is_sto: true, is_agent: true, is_ota: true }); setMealModal(true); }}
                className="text-sm bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary/90">+ Add Package</button>
            </div>
            {mealPackages.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-400 text-sm">No meal packages yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    {['Name', 'Price/person/night', 'Online', 'STO', 'Agent', 'OTA', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {mealPackages.map(mp => (
                    <tr key={mp.id}>
                      <td className="px-4 py-3 font-medium">{mp.name}</td>
                      <td className="px-4 py-3">{property?.currency} {Number(mp.price_per_person).toLocaleString()}</td>
                      {['is_online','is_sto','is_agent','is_ota'].map(k => (
                        <td key={k} className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${mp[k] ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
                            {mp[k] ? 'On' : 'Off'}
                          </span>
                        </td>
                      ))}
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => { setMealForm({ ...mp, is_online: !!mp.is_online, is_sto: !!mp.is_sto, is_agent: !!mp.is_agent, is_ota: !!mp.is_ota }); setMealModal(true); }}
                            className="text-xs text-teal hover:underline">Edit</button>
                          <button onClick={() => deleteMealPackage(mp.id)}
                            className="text-xs text-red-400 hover:underline">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Seasonal Adjustments */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-semibold text-gray-800">Seasonal Adjustments</h2>
                <p className="text-xs text-gray-400 mt-0.5">% adjustment applied to accommodation rates only. Positive = peak uplift, negative = low-season discount.</p>
              </div>
              <button onClick={() => { setSeasonForm({ name: '', pct_change: '', start_date: '', end_date: '' }); setSeasonModal(true); }}
                className="text-sm bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary/90">+ Add Season</button>
            </div>
            {seasons.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-400 text-sm">No seasonal adjustments yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>{['Name', '% Change', 'From', 'To', ''].map(h => <th key={h} className="px-4 py-3 text-left">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {seasons.map((s, i) => {
                    const overlaps = seasons.some((other, j) => j !== i &&
                      new Date(s.start_date) <= new Date(other.end_date) &&
                      new Date(s.end_date) >= new Date(other.start_date));
                    return (
                      <tr key={s.id}>
                        <td className="px-4 py-3 font-medium">
                          {overlaps && <span title="Overlapping dates — first match wins" className="text-amber-500 mr-1">⚠</span>}
                          {s.name}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`font-semibold ${s.pct_change >= 0 ? 'text-green-600' : 'text-amber-600'}`}>
                            {s.pct_change >= 0 ? '+' : ''}{s.pct_change}%
                          </span>
                        </td>
                        <td className="px-4 py-3">{s.start_date}</td>
                        <td className="px-4 py-3">{s.end_date}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button onClick={() => { setSeasonForm(s); setSeasonModal(true); }}
                              className="text-xs text-teal hover:underline">Edit</button>
                            <button onClick={() => deleteSeason(s.id)}
                              className="text-xs text-red-400 hover:underline">Delete</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── PROPERTY / FINANCE / EMAIL ── */}
      {['property', 'finance', 'email'].includes(activeSection) && (() => {
        const sectionMap = { property: 0, finance: 1, email: 2 };
        const s = propSections[sectionMap[activeSection]];
        return (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-700 mb-4">{s.title}</h2>
            <div className="grid grid-cols-2 gap-4">
              {s.fields.map(f => (
                <div key={f.k} className={f.k === 'payment_instructions' ? 'col-span-2' : ''}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{f.l}</label>
                  {f.k === 'payment_instructions' ? (
                    <textarea rows={3} value={form[f.k] || ''}
                      onChange={e => setForm(p => ({ ...p, [f.k]: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  ) : (
                    <input type={f.t || 'text'} value={form[f.k] || ''}
                      onChange={e => setForm(p => ({ ...p, [f.k]: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  )}
                </div>
              ))}
            </div>
            <div className="mt-5 pt-4 border-t border-gray-100">
              <button onClick={save} disabled={saving}
                className="bg-gold text-white px-6 py-2 rounded-lg font-medium hover:opacity-90 disabled:opacity-50 text-sm">
                {saving ? 'Saving…' : 'Save Settings'}
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── ADD/EDIT ROOM MODAL ── */}
      <Modal open={roomModal} onClose={() => setRoomModal(false)}
        title={roomForm.id ? 'Edit Room' : 'Add Room'}>
        <div className="space-y-4">

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Room Name <span className="text-red-400">*</span>
              <span className="text-gray-400 font-normal ml-1">e.g. Meadow Chalet 1</span>
            </label>
            <input
              value={roomForm.name || ''}
              onChange={e => setRoomForm(p => ({ ...p, name: e.target.value }))}
              placeholder="Meadow Chalet 1"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* Room Type + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Room Type</label>
              <select
                value={roomForm.room_type_id || ''}
                onChange={e => setRoomForm(p => ({ ...p, room_type_id: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">— No type —</option>
                {roomTypes.map(rt => <option key={rt.id} value={rt.id}>{rt.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={roomForm.status || 'available'}
                onChange={e => setRoomForm(p => ({ ...p, status: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="available">Available</option>
                <option value="occupied">Occupied</option>
                <option value="maintenance">Maintenance</option>
                <option value="blocked">Blocked</option>
              </select>
            </div>
          </div>

          {/* Bedrooms + Max occupancy + Max adults */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bedrooms</label>
              <select
                value={roomForm.bedrooms ?? 1}
                onChange={e => setRoomForm(p => ({ ...p, bedrooms: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                {[1,2,3,4,5].map(n => (
                  <option key={n} value={n}>{n} Bedroom{n > 1 ? 's' : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Guests</label>
              <input type="number" min={1} max={30}
                value={roomForm.max_occupancy || ''}
                onChange={e => setRoomForm(p => ({ ...p, max_occupancy: e.target.value }))}
                placeholder="e.g. 4"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Adults</label>
              <input type="number" min={1} max={20}
                value={roomForm.max_adults || ''}
                onChange={e => setRoomForm(p => ({ ...p, max_adults: e.target.value }))}
                placeholder="e.g. 2"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Room Description{' '}
              <span className="text-xs text-gray-400 font-normal">(shown on booking website)</span>
            </label>
            <textarea
              rows={3}
              value={roomForm.description || ''}
              onChange={e => setRoomForm(p => ({ ...p, description: e.target.value }))}
              placeholder="Describe this room for guests..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* Bed config */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bed Configuration</label>
            <select
              value={roomForm.bed_config || ''}
              onChange={e => setRoomForm(p => ({ ...p, bed_config: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">— Select bed config —</option>
              {BED_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          {/* Alternative bed layout */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Alternative Bed Layout{' '}
              <span className="text-gray-400 font-normal text-xs">optional secondary arrangement</span>
            </label>
            <select
              value={roomForm.bed_config_alt || ''}
              onChange={e => setRoomForm(p => ({ ...p, bed_config_alt: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">— None (no alternate layout) —</option>
              {BED_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          {/* Amenities */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Amenities</label>
            <div className="grid grid-cols-2 gap-1.5">
              {AMENITIES.map(amenity => (
                <label key={amenity} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedAmenities.includes(amenity)}
                    onChange={() => toggleAmenity(amenity)}
                    className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-sm text-gray-700">{amenity}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Floor / Area */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Floor / Area</label>
            <input
              value={roomForm.floor || ''}
              onChange={e => setRoomForm(p => ({ ...p, floor: e.target.value }))}
              placeholder="e.g. Ground, Ridge, Beachside"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* Show online toggle */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200">
            <div>
              <p className="text-sm font-medium text-gray-700">Show on Website</p>
              <p className="text-xs text-gray-400 mt-0.5">When off, this room won't appear on the public booking site</p>
            </div>
            <button
              type="button"
              onClick={() => setRoomForm(p => ({ ...p, show_online: !p.show_online }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${roomForm.show_online ? 'bg-emerald-500' : 'bg-gray-300'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${roomForm.show_online ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          {/* Wheelchair accessible toggle */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200">
            <div>
              <p className="text-sm font-medium text-gray-700">♿ Wheelchair Accessible</p>
              <p className="text-xs text-gray-400 mt-0.5">Mark this room as wheelchair-friendly on the website</p>
            </div>
            <button
              type="button"
              onClick={() => setRoomForm(p => ({ ...p, wheelchair_accessible: !p.wheelchair_accessible }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${roomForm.wheelchair_accessible ? 'bg-emerald-500' : 'bg-gray-300'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${roomForm.wheelchair_accessible ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Internal Notes</label>
            <textarea rows={2}
              value={roomForm.notes || ''}
              onChange={e => setRoomForm(p => ({ ...p, notes: e.target.value }))}
              placeholder="Any internal notes about this room…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setRoomModal(false)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button onClick={saveRoom}
            className="px-4 py-2 bg-gold text-white rounded-lg text-sm font-medium hover:opacity-90">Save Room</button>
        </div>
      </Modal>

      {/* ── ADD/EDIT ROOM TYPE MODAL ── */}
      <Modal open={rtModal} onClose={() => setRtModal(false)}
        title={rtForm.id ? 'Edit Room Type' : 'Add Room Type'}>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Type Name <span className="text-red-400">*</span>
            <span className="text-gray-400 font-normal ml-1">e.g. Chalet, Tent, Campsite</span>
          </label>
          <input
            autoFocus
            value={rtForm.name || ''}
            onChange={e => setRtForm(p => ({ ...p, name: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && rtForm.name?.trim() && saveRoomType()}
            placeholder="e.g. Chalet"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setRtModal(false)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button onClick={saveRoomType} disabled={!rtForm.name?.trim()}
            className="px-4 py-2 bg-gold text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-40">Save Type</button>
        </div>
      </Modal>

      {/* ── DELETE ROOM CONFIRM ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="font-bold text-gray-800 text-lg mb-2">Delete Room?</h3>
            <p className="text-gray-500 text-sm mb-6">
              Are you sure you want to delete <strong>{deleteConfirm.name || deleteConfirm.room_number}</strong>? This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={() => deleteRoom(deleteConfirm)}
                className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE ROOM TYPE CONFIRM ── */}
      {rtDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="font-bold text-gray-800 text-lg mb-2">Delete Room Type?</h3>
            <p className="text-gray-500 text-sm mb-6">
              Delete <strong>{rtDeleteConfirm.name}</strong>? Rooms assigned to this type will become unassigned.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setRtDeleteConfirm(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={() => deleteRoomType(rtDeleteConfirm)}
                className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
