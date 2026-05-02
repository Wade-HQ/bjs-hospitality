import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../../api/index.js';
import StatusBadge from '../../components/StatusBadge.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';

export default function GuestProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [guest, setGuest] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState('passport');
  const fileInputRef = useRef(null);

  const load = () => {
    api.get(`/api/guests/${id}`).then(r => {
      setGuest(r.data.guest);
      setForm(r.data.guest);
      setDocuments(r.data.documents || []);
    });
    api.get('/api/bookings', { params: { guest_id: id } }).then(r => setBookings(r.data.bookings || []));
  };
  useEffect(load, [id]);

  const save = async () => {
    try { await api.put(`/api/guests/${id}`, form); addToast('Guest updated'); setEditing(false); load(); }
    catch (e) { addToast(e.response?.data?.error || 'Error', 'error'); }
  };

  const uploadDocument = async (file) => {
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('doc_type', docType);
    try {
      await api.post(`/api/guests/${id}/documents`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      addToast('Document uploaded');
      load();
    } catch (e) { addToast(e.response?.data?.error || 'Upload failed', 'error'); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const deleteDocument = async (docId) => {
    if (!window.confirm('Delete this document?')) return;
    try {
      await api.delete(`/api/guests/${id}/documents/${docId}`);
      addToast('Document deleted');
      load();
    } catch (e) { addToast(e.response?.data?.error || 'Error', 'error'); }
  };

  if (!guest) return <div className="p-12 text-center text-gray-400">Loading…</div>;

  const fields = [
    { k:'first_name', l:'First Name' },{ k:'last_name', l:'Last Name' },
    { k:'email', l:'Email', t:'email' },{ k:'phone', l:'Phone' },
    { k:'nationality', l:'Nationality' },{ k:'date_of_birth', l:'Date of Birth', t:'date' },
    { k:'address', l:'Address' },{ k:'city', l:'City' },{ k:'country', l:'Country' },
    { k:'id_type', l:'ID Type' },{ k:'id_number', l:'ID Number' },{ k:'id_expiry', l:'ID Expiry', t:'date' },
  ];

  return (
    <div className="max-w-5xl">
      {bookings.length > 1 && (
        <div className="mb-4 flex items-center gap-3 bg-teal-50 border border-teal-200 rounded-xl px-5 py-3 text-sm text-teal-700 font-medium">
          <span className="text-lg">★</span>
          Returning guest — {bookings.length} stays on record. Documents may already be on file below.
        </div>
      )}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600 text-xl">←</button>
        <h1 className="text-2xl font-bold text-primary">{guest.first_name} {guest.last_name}</h1>
        {guest.vip_flag ? <span className="bg-gold text-white text-xs px-2 py-0.5 rounded-full">VIP</span> : null}
        <button onClick={() => setEditing(!editing)} className="ml-auto text-sm text-teal hover:underline">{editing ? 'Cancel' : 'Edit'}</button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        {editing ? (
          <>
            <div className="grid grid-cols-2 gap-4 mb-4">
              {fields.map(f => (
                <div key={f.k}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{f.l}</label>
                  <input type={f.t||'text'} value={form[f.k]||''} onChange={e => setForm(p=>({...p,[f.k]:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">VIP</label>
                <input type="checkbox" checked={!!form.vip_flag} onChange={e => setForm(p=>({...p,vip_flag:e.target.checked?1:0}))} className="h-4 w-4" />
              </div>
            </div>
            <textarea placeholder="Notes" value={form.notes||''} onChange={e => setForm(p=>({...p,notes:e.target.value}))} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4" />
            <button onClick={save} className="bg-gold text-white px-6 py-2 rounded-lg text-sm font-medium">Save</button>
          </>
        ) : (
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            {fields.filter(f => guest[f.k]).map(f => (
              <div key={f.k}><dt className="text-gray-400 text-xs">{f.l}</dt><dd className="font-medium text-gray-800 mt-0.5">{guest[f.k]}</dd></div>
            ))}
            {guest.notes && <div className="col-span-full"><dt className="text-gray-400 text-xs">Notes</dt><dd className="text-gray-700 mt-0.5">{guest.notes}</dd></div>}
          </dl>
        )}
      </div>

      {/* Documents */}
      <div className="bg-white rounded-xl border border-gray-200 mb-6">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-700">Documents</h2>
          <div className="flex items-center gap-2">
            <select
              value={docType}
              onChange={e => setDocType(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-2 py-1.5"
            >
              <option value="passport">Passport</option>
              <option value="id">ID Card</option>
              <option value="vehicle">Vehicle Doc</option>
              <option value="other">Other</option>
            </select>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              onChange={e => uploadDocument(e.target.files[0])}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="px-3 py-1.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {uploading ? 'Uploading…' : '+ Upload'}
            </button>
          </div>
        </div>
        {documents.length === 0 ? (
          <div className="px-5 py-6 text-center text-gray-400 text-sm">No documents on file</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {documents.map(d => (
              <div key={d.id} className="flex items-center gap-3 px-5 py-3">
                <span className="text-lg">📄</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{d.file_name}</div>
                  <div className="text-xs text-gray-400 capitalize">{d.doc_type} · {new Date(d.uploaded_at).toLocaleDateString()}</div>
                </div>
                <a
                  href={`/api/guests/${id}/documents/${d.id}/download`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-teal-600 hover:underline font-medium"
                >
                  Download
                </a>
                <button
                  onClick={() => deleteDocument(d.id)}
                  className="text-xs text-red-400 hover:text-red-600 hover:underline"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <h2 className="font-semibold text-gray-700 p-4 border-b border-gray-100">Booking History ({bookings.length})</h2>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
            <tr>{['Ref','Check-in','Check-out','Nights','Total','Status'].map(h => <th key={h} className="px-4 py-3 text-left">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {bookings.map(b => (
              <tr key={b.id} className="hover:bg-gray-50">
                <td className="px-4 py-3"><Link to={`/dashboard/bookings/${b.id}`} className="text-teal font-mono hover:underline">{b.booking_ref}</Link></td>
                <td className="px-4 py-3 text-gray-600">{b.check_in}</td>
                <td className="px-4 py-3 text-gray-600">{b.check_out}</td>
                <td className="px-4 py-3">{b.nights}</td>
                <td className="px-4 py-3 font-medium">{b.currency} {Number(b.total_amount).toLocaleString()}</td>
                <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
              </tr>
            ))}
            {bookings.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No bookings</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
