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
  const { addToast } = useToast();

  useEffect(() => {
    if (property) setForm(property);
    api.get('/api/rooms').then(r => setRooms(r.data?.rooms || []));
    api.get('/api/room-types').then(r => setRoomTypes(r.data?.room_types || []));
  }, [property]);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/api/settings', form);
      addToast('Settings saved');
      reloadProperty();
    } catch (e) { addToast(e.response?.data?.error || 'Error', 'error'); }
    finally { setSaving(false); }
  };

  const saveRoom = async () => {
    try {
      if (roomForm.id) await api.put(`/api/rooms/${roomForm.id}`, roomForm);
      else await api.post('/api/rooms', roomForm);
      addToast('Saved'); setRoomModal(false); api.get('/api/rooms').then(r => setRooms(r.data));
    } catch (e) { addToast(e.response?.data?.error || 'Error', 'error'); }
  };

  const sections = [
    { title: 'Property Info', fields: [
      {k:'name',l:'Name'},{k:'address',l:'Address'},{k:'country',l:'Country'},{k:'timezone',l:'Timezone'},
      {k:'contact_email',l:'Email'},{k:'contact_phone',l:'Phone'},
    ]},
    { title: 'Finance', fields: [
      {k:'currency',l:'Currency'},{k:'tax_label',l:'Tax Label'},
      {k:'tax_rate',l:'Tax Rate %',t:'number'},{k:'invoice_prefix',l:'Invoice Prefix'},
      {k:'vat_number',l:'VAT Number'},{k:'payment_instructions',l:'Payment Instructions'},
    ]},
    { title: 'Email (SMTP)', fields: [
      {k:'smtp_host',l:'SMTP Host'},{k:'smtp_port',l:'Port',t:'number'},
      {k:'smtp_user',l:'SMTP User'},{k:'smtp_pass',l:'SMTP Pass',t:'password'},
      {k:'smtp_from',l:'From Address'},
    ]},
  ];

  if (!property) return <div className="p-12 text-center text-gray-400">Loading…</div>;

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-primary mb-6">Settings — {property.name}</h1>
      <div className="space-y-6">
        {sections.map(s => (
          <div key={s.title} className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-700 mb-4">{s.title}</h2>
            <div className="grid grid-cols-2 gap-4">
              {s.fields.map(f => (
                <div key={f.k}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{f.l}</label>
                  <input type={f.t||'text'} value={form[f.k]||''} onChange={e => setForm(p=>({...p,[f.k]:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 mb-8">
        <button onClick={save} disabled={saving} className="bg-gold text-white px-6 py-2 rounded-lg font-medium hover:opacity-90 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-700">Rooms</h2>
          <button onClick={() => { setRoomForm({ room_number:'', room_type_id:'', floor:'', status:'available' }); setRoomModal(true); }} className="text-sm bg-gold text-white px-3 py-1.5 rounded-lg">+ Add Room</button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
            <tr>{['Number','Floor','Type','Status','Actions'].map(h => <th key={h} className="px-4 py-3 text-left">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rooms.map(r => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{r.room_number}</td>
                <td className="px-4 py-3 text-gray-500">{r.floor||'—'}</td>
                <td className="px-4 py-3 text-gray-600">{r.room_type_name||'—'}</td>
                <td className="px-4 py-3 capitalize text-gray-600">{r.status}</td>
                <td className="px-4 py-3">
                  <button onClick={() => { setRoomForm(r); setRoomModal(true); }} className="text-teal text-xs hover:underline">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={roomModal} onClose={() => setRoomModal(false)} title={roomForm.id ? 'Edit Room' : 'Add Room'}>
        <div className="space-y-3">
          {[{k:'room_number',l:'Room Number'},{k:'floor',l:'Floor'}].map(f => (
            <div key={f.k}><label className="block text-sm font-medium text-gray-700 mb-1">{f.l}</label><input value={roomForm[f.k]||''} onChange={e => setRoomForm(p=>({...p,[f.k]:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
          ))}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Room Type</label>
            <select value={roomForm.room_type_id||''} onChange={e => setRoomForm(p=>({...p,room_type_id:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">None</option>
              {roomTypes.map(rt => <option key={rt.id} value={rt.id}>{rt.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select value={roomForm.status||'available'} onChange={e => setRoomForm(p=>({...p,status:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {['available','occupied','maintenance','blocked'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setRoomModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
          <button onClick={saveRoom} className="px-4 py-2 bg-gold text-white rounded-lg text-sm font-medium">Save</button>
        </div>
      </Modal>
    </div>
  );
}
