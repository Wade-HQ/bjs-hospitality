import React, { useState, useEffect } from 'react';
import api from '../../api/index.js';
import Modal from '../../components/Modal.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';
import { useProperty } from '../../contexts/PropertyContext.jsx';

export default function Settings() {
  const { property, reload: reloadProperty } = useProperty();
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [roomTypes, setRoomTypes] = useState([]);
  const [roomModal, setRoomModal] = useState(false);
  const [roomForm, setRoomForm] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null); // room to delete
  const [rtModal, setRtModal] = useState(false);
  const [rtForm, setRtForm] = useState({});
  const [activeSection, setActiveSection] = useState('rooms');
  const { addToast } = useToast();

  const load = () => {
    api.get('/api/rooms').then(r => setRooms(r.data?.rooms || []));
    api.get('/api/room-types').then(r => setRoomTypes(r.data?.room_types || []));
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
    setRoomForm({ room_number: '', room_type_id: String(roomTypeId), floor: '', status: 'available', notes: '' });
    setRoomModal(true);
  };
  const openEditRoom = (r) => {
    setRoomForm({ ...r, room_type_id: String(r.room_type_id || '') });
    setRoomModal(true);
  };
  const saveRoom = async () => {
    try {
      if (roomForm.id) await api.put(`/api/rooms/${roomForm.id}`, roomForm);
      else await api.post('/api/rooms', roomForm);
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
    } catch (e) { addToast(e.response?.data?.error || 'Cannot delete room with active bookings', 'error'); setDeleteConfirm(null); }
  };

  // ── Room Type CRUD ────────────────────────────────────────────────────────
  const openAddRoomType = () => {
    setRtForm({ name: '', description: '', max_occupancy: 2, base_rate: 0 });
    setRtModal(true);
  };
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

  const STATUS_COLORS = {
    available: 'bg-emerald-100 text-emerald-700',
    occupied: 'bg-blue-100 text-blue-700',
    maintenance: 'bg-amber-100 text-amber-700',
    blocked: 'bg-red-100 text-red-700',
  };

  if (!property) return <div className="p-12 text-center text-gray-400">Loading…</div>;

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-2xl font-bold text-primary mb-1">Settings</h1>
      <p className="text-gray-400 text-sm mb-6">{property.name}</p>

      {/* Section tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        {[['rooms', '🛏 Rooms & Types'], ['property', '🏨 Property'], ['finance', '💰 Finance'], ['email', '📧 Email']].map(([k, l]) => (
          <button
            key={k}
            onClick={() => setActiveSection(k)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeSection === k ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* ── ROOMS & TYPES ── */}
      {activeSection === 'rooms' && (
        <div className="space-y-6">

          {/* Room Types */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-semibold text-gray-800">Room Types</h2>
                <p className="text-xs text-gray-400 mt-0.5">Categories of accommodation — add individual rooms under each type</p>
              </div>
              <button onClick={openAddRoomType} className="text-sm bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary/90">
                + Add Type
              </button>
            </div>

            {roomTypes.length === 0 ? (
              <div className="px-6 py-10 text-center text-gray-400 text-sm">No room types yet. Add one above.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {roomTypes.map(rt => {
                  const rtRooms = rooms.filter(r => r.room_type_id === rt.id);
                  return (
                    <div key={rt.id} className="px-6 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3">
                            <span className="font-semibold text-gray-800">{rt.name}</span>
                            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                              {rtRooms.length} room{rtRooms.length !== 1 ? 's' : ''}
                            </span>
                            <span className="text-xs text-gray-400">Max {rt.max_occupancy} guests</span>
                            {rt.base_rate > 0 && (
                              <span className="text-xs text-emerald-600 font-medium">
                                {rt.currency || 'ZAR'} {Number(rt.base_rate).toLocaleString()}/night
                              </span>
                            )}
                          </div>
                          {rt.description && (
                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{rt.description}</p>
                          )}

                          {/* Rooms under this type */}
                          {rtRooms.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {rtRooms.map(r => (
                                <div key={r.id} className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
                                  <span className="text-sm font-medium text-gray-700">{r.room_number}</span>
                                  {r.floor && <span className="text-xs text-gray-400">· Floor {r.floor}</span>}
                                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[r.status] || ''}`}>
                                    {r.status}
                                  </span>
                                  <button
                                    onClick={() => openEditRoom(r)}
                                    className="text-xs text-teal hover:underline ml-1"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => setDeleteConfirm(r)}
                                    className="text-xs text-red-400 hover:text-red-600 hover:underline"
                                  >
                                    Delete
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => openAddRoom(rt.id)}
                            className="text-xs border border-gold text-gold px-3 py-1.5 rounded-lg hover:bg-gold hover:text-white transition-colors"
                          >
                            + Add Room
                          </button>
                          <button
                            onClick={() => openEditRoomType(rt)}
                            className="text-xs border border-gray-200 text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-50"
                          >
                            Edit Type
                          </button>
                        </div>
                      </div>
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
                    <span className="text-sm font-medium">{r.room_number}</span>
                    <button onClick={() => openEditRoom(r)} className="text-xs text-teal hover:underline">Edit</button>
                    <button onClick={() => setDeleteConfirm(r)} className="text-xs text-red-400 hover:underline">Delete</button>
                  </div>
                ))}
              </div>
            </div>
          )}
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
                    <textarea
                      rows={3}
                      value={form[f.k] || ''}
                      onChange={e => setForm(p => ({ ...p, [f.k]: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                  ) : (
                    <input
                      type={f.t || 'text'}
                      value={form[f.k] || ''}
                      onChange={e => setForm(p => ({ ...p, [f.k]: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="mt-5 pt-4 border-t border-gray-100">
              <button onClick={save} disabled={saving} className="bg-gold text-white px-6 py-2 rounded-lg font-medium hover:opacity-90 disabled:opacity-50 text-sm">
                {saving ? 'Saving…' : 'Save Settings'}
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── ADD/EDIT ROOM MODAL ── */}
      <Modal open={roomModal} onClose={() => setRoomModal(false)} title={roomForm.id ? 'Edit Room' : 'Add Room'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Room Number / Name <span className="text-red-400">*</span></label>
              <input
                value={roomForm.room_number || ''}
                onChange={e => setRoomForm(p => ({ ...p, room_number: e.target.value }))}
                placeholder="e.g. C1, T3, Tent 4"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Floor / Area</label>
              <input
                value={roomForm.floor || ''}
                onChange={e => setRoomForm(p => ({ ...p, floor: e.target.value }))}
                placeholder="e.g. Ground, Ridge, Dune"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Room Type</label>
            <select
              value={roomForm.room_type_id || ''}
              onChange={e => setRoomForm(p => ({ ...p, room_type_id: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">— No type assigned —</option>
              {roomTypes.map(rt => <option key={rt.id} value={rt.id}>{rt.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={roomForm.status || 'available'}
              onChange={e => setRoomForm(p => ({ ...p, status: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="available">Available</option>
              <option value="occupied">Occupied</option>
              <option value="maintenance">Maintenance</option>
              <option value="blocked">Blocked</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              rows={2}
              value={roomForm.notes || ''}
              onChange={e => setRoomForm(p => ({ ...p, notes: e.target.value }))}
              placeholder="Any internal notes about this room…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setRoomModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button onClick={saveRoom} className="px-4 py-2 bg-gold text-white rounded-lg text-sm font-medium hover:opacity-90">Save Room</button>
        </div>
      </Modal>

      {/* ── ADD/EDIT ROOM TYPE MODAL ── */}
      <Modal open={rtModal} onClose={() => setRtModal(false)} title={rtForm.id ? 'Edit Room Type' : 'Add Room Type'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-400">*</span></label>
            <input
              value={rtForm.name || ''}
              onChange={e => setRtForm(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Meadow Chalet"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              rows={3}
              value={rtForm.description || ''}
              onChange={e => setRtForm(p => ({ ...p, description: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Occupancy</label>
              <input type="number" min={1} max={20}
                value={rtForm.max_occupancy || 2}
                onChange={e => setRtForm(p => ({ ...p, max_occupancy: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Base Rate / Night</label>
              <input type="number" min={0}
                value={rtForm.base_rate || 0}
                onChange={e => setRtForm(p => ({ ...p, base_rate: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setRtModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button onClick={saveRoomType} className="px-4 py-2 bg-gold text-white rounded-lg text-sm font-medium hover:opacity-90">Save Type</button>
        </div>
      </Modal>

      {/* ── DELETE CONFIRM ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="font-bold text-gray-800 text-lg mb-2">Delete Room?</h3>
            <p className="text-gray-500 text-sm mb-6">
              Are you sure you want to delete <strong>{deleteConfirm.room_number}</strong>? This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={() => deleteRoom(deleteConfirm)} className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
