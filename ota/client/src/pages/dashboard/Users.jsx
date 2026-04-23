import React, { useState, useEffect } from 'react';
import api from '../../api/index.js';
import Modal from '../../components/Modal.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name:'', email:'', role:'front_desk', password:'', property_access_json:'[]' });
  const { addToast } = useToast();

  const load = () => api.get('/api/users').then(r => setUsers(r.data));
  useEffect(load, []);

  const openEdit = (u) => { setEditing(u); setForm({ name:u.name, email:u.email, role:u.role, password:'', property_access_json:u.property_access_json }); setModal(true); };
  const openNew = () => { setEditing(null); setForm({ name:'', email:'', role:'front_desk', password:'', property_access_json:'[1,2]' }); setModal(true); };

  const save = async () => {
    try {
      const body = { ...form };
      if (!body.password) delete body.password;
      if (editing) await api.put(`/api/users/${editing.id}`, body);
      else await api.post('/api/users', body);
      addToast(editing ? 'Updated' : 'User created');
      setModal(false); load();
    } catch (e) { addToast(e.response?.data?.error || 'Error', 'error'); }
  };

  const toggle = async (u) => {
    try { await api.put(`/api/users/${u.id}`, { active: u.active ? 0 : 1 }); load(); } catch { addToast('Error', 'error'); }
  };

  const roles = ['owner','hotel_manager','front_desk','accountant','ota_admin'];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-primary">Users</h1>
        <button onClick={openNew} className="bg-gold text-white px-4 py-2 rounded-lg text-sm font-medium">+ Add User</button>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
            <tr>{['Name','Email','Role','Properties','Active','Actions'].map(h => <th key={h} className="px-4 py-3 text-left">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map(u => (
              <tr key={u.id} className={`hover:bg-gray-50 ${!u.active ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 font-medium">{u.name}</td>
                <td className="px-4 py-3 text-gray-600">{u.email}</td>
                <td className="px-4 py-3"><span className="bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full">{u.role}</span></td>
                <td className="px-4 py-3 text-gray-500 font-mono text-xs">{u.property_access_json}</td>
                <td className="px-4 py-3">
                  <button onClick={() => toggle(u)} className={`text-xs px-2 py-0.5 rounded-full ${u.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {u.active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => openEdit(u)} className="text-teal text-xs hover:underline">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit User' : 'New User'}>
        <div className="space-y-4">
          {[{ k:'name',l:'Name' },{ k:'email',l:'Email',t:'email' },{ k:'password',l:editing?'New Password (leave blank to keep)':'Password',t:'password' }].map(f => (
            <div key={f.k}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{f.l}</label>
              <input type={f.t||'text'} value={form[f.k]} onChange={e => setForm(p=>({...p,[f.k]:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select value={form.role} onChange={e => setForm(p=>({...p,role:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {roles.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Property Access (JSON array of IDs)</label>
            <input value={form.property_access_json} onChange={e => setForm(p=>({...p,property_access_json:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
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
