import React, { useState, useEffect } from 'react';
import api from '../../api/index.js';
import Modal from '../../components/Modal.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';

export default function Availability() {
  const [blocks, setBlocks] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ room_id: '', start_date: '', end_date: '', reason: 'blocked', notes: '' });
  const { addToast } = useToast();

  const load = () => api.get('/api/availability/blocks').then(r => setBlocks(r.data?.blocks || []));
  useEffect(() => { load(); api.get('/api/rooms').then(r => setRooms(r.data?.rooms || [])); }, []);

  const save = async () => {
    try { await api.post('/api/availability/blocks', form); addToast('Block created'); setModal(false); load(); }
    catch (e) { addToast(e.response?.data?.error || 'Error', 'error'); }
  };

  const remove = async (id) => {
    if (!confirm('Remove this block?')) return;
    try { await api.delete(`/api/availability/blocks/${id}`); addToast('Removed'); load(); }
    catch { addToast('Error', 'error'); }
  };

  const reasonColor = { maintenance:'bg-orange-100 text-orange-700', owner:'bg-blue-100 text-blue-700', blocked:'bg-gray-100 text-gray-700', channel_sync:'bg-purple-100 text-purple-700' };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-primary">Availability Blocks</h1>
        <button onClick={() => setModal(true)} className="bg-gold text-white px-4 py-2 rounded-lg text-sm font-medium">+ Add Block</button>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
            <tr>{['Room','Start','End','Reason','Notes','Actions'].map(h => <th key={h} className="px-4 py-3 text-left">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {blocks.map(b => (
              <tr key={b.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">Room {b.room_number}</td>
                <td className="px-4 py-3 text-gray-600">{b.start_date}</td>
                <td className="px-4 py-3 text-gray-600">{b.end_date}</td>
                <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${reasonColor[b.reason] || 'bg-gray-100 text-gray-600'}`}>{b.reason}</span></td>
                <td className="px-4 py-3 text-gray-500">{b.notes || '—'}</td>
                <td className="px-4 py-3"><button onClick={() => remove(b.id)} className="text-red-500 text-xs hover:underline">Remove</button></td>
              </tr>
            ))}
            {blocks.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">No availability blocks</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Add Availability Block">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Room</label>
            <select value={form.room_id} onChange={e => setForm(p=>({...p,room_id:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">Select room</option>
              {rooms.map(r => <option key={r.id} value={r.id}>Room {r.room_number}</option>)}
            </select>
          </div>
          {[{k:'start_date',l:'Start Date',t:'date'},{k:'end_date',l:'End Date',t:'date'}].map(f => (
            <div key={f.k}><label className="block text-sm font-medium text-gray-700 mb-1">{f.l}</label><input type={f.t} value={form[f.k]} onChange={e => setForm(p=>({...p,[f.k]:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
          ))}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
            <select value={form.reason} onChange={e => setForm(p=>({...p,reason:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {['maintenance','owner','blocked','channel_sync'].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Notes</label><textarea value={form.notes} onChange={e => setForm(p=>({...p,notes:e.target.value}))} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
          <button onClick={save} className="px-4 py-2 bg-gold text-white rounded-lg text-sm font-medium">Save</button>
        </div>
      </Modal>
    </div>
  );
}
