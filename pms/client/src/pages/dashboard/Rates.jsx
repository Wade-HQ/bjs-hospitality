import React, { useState, useEffect } from 'react';
import api from '../../api/index.js';
import Modal from '../../components/Modal.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';

export default function Rates() {
  const [rates, setRates] = useState([]);
  const [roomTypes, setRoomTypes] = useState([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const { addToast } = useToast();

  const load = () => api.get('/api/rates').then(r => setRates(r.data?.rates || []));
  useEffect(() => { load(); api.get('/api/room-types').then(r => setRoomTypes(r.data?.room_types || [])); }, []);

  const openNew = () => { setEditing(null); setForm({ name:'', room_type_id:'', rate_per_night:'', valid_from:'', valid_to:'', min_nights:1, channel:'all', active:1 }); setModal(true); };
  const openEdit = (r) => { setEditing(r); setForm(r); setModal(true); };

  const save = async () => {
    try {
      if (editing) await api.put(`/api/rates/${editing.id}`, form);
      else await api.post('/api/rates', form);
      addToast('Saved'); setModal(false); load();
    } catch (e) { addToast(e.response?.data?.error || 'Error', 'error'); }
  };

  const toggle = async (r) => {
    await api.put(`/api/rates/${r.id}`, { active: r.active ? 0 : 1 }); load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-primary">Rates</h1>
        <button onClick={openNew} className="bg-gold text-white px-4 py-2 rounded-lg text-sm font-medium">+ Add Rate</button>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
            <tr>{['Name','Room Type','Rate/Night','Valid From','Valid To','Min Nights','Channel','Status','Actions'].map(h => <th key={h} className="px-4 py-3 text-left">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rates.map(r => (
              <tr key={r.id} className={`hover:bg-gray-50 ${!r.active ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 font-medium">{r.name}</td>
                <td className="px-4 py-3 text-gray-600">{r.room_type_name || '—'}</td>
                <td className="px-4 py-3 font-medium">{r.currency} {Number(r.rate_per_night).toLocaleString()}</td>
                <td className="px-4 py-3 text-gray-500">{r.valid_from || '—'}</td>
                <td className="px-4 py-3 text-gray-500">{r.valid_to || '—'}</td>
                <td className="px-4 py-3">{r.min_nights}</td>
                <td className="px-4 py-3 capitalize">{r.channel}</td>
                <td className="px-4 py-3">
                  <button onClick={() => toggle(r)} className={`text-xs px-2 py-0.5 rounded-full ${r.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{r.active ? 'Active' : 'Off'}</button>
                </td>
                <td className="px-4 py-3"><button onClick={() => openEdit(r)} className="text-teal text-xs hover:underline">Edit</button></td>
              </tr>
            ))}
            {rates.length === 0 && <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">No rates configured</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Rate' : 'New Rate'}>
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Name</label><input value={form.name||''} onChange={e => setForm(p=>({...p,name:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Room Type</label>
            <select value={form.room_type_id||''} onChange={e => setForm(p=>({...p,room_type_id:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">All room types</option>
              {roomTypes.map(rt => <option key={rt.id} value={rt.id}>{rt.name}</option>)}
            </select>
          </div>
          {[{k:'rate_per_night',l:'Rate per Night',t:'number'},{k:'valid_from',l:'Valid From',t:'date'},{k:'valid_to',l:'Valid To',t:'date'},{k:'min_nights',l:'Min Nights',t:'number'}].map(f => (
            <div key={f.k}><label className="block text-sm font-medium text-gray-700 mb-1">{f.l}</label><input type={f.t} value={form[f.k]||''} onChange={e => setForm(p=>({...p,[f.k]:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
          ))}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Channel</label>
            <select value={form.channel||'all'} onChange={e => setForm(p=>({...p,channel:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {['all','direct','ota'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
          <button onClick={save} className="px-4 py-2 bg-gold text-white rounded-lg text-sm font-medium">Save</button>
        </div>
      </Modal>
    </div>
  );
}
