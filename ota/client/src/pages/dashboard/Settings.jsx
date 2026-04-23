import React, { useState, useEffect } from 'react';
import api from '../../api/index.js';
import { useToast } from '../../contexts/ToastContext.jsx';

export default function Settings() {
  const [properties, setProperties] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    api.get('/api/properties').then(r => { setProperties(r.data); if (r.data.length) { setSelected(r.data[0]); setForm(r.data[0]); } });
  }, []);

  const selectProp = (p) => { setSelected(p); setForm(p); };

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/api/properties/${selected.id}`, form);
      addToast('Settings saved');
      api.get('/api/properties').then(r => setProperties(r.data));
    } catch (e) { addToast(e.response?.data?.error || 'Error', 'error'); }
    finally { setSaving(false); }
  };

  const sections = [
    { title: 'Basic Info', fields: [
      { key:'name', label:'Property Name' }, { key:'slug', label:'URL Slug' },
      { key:'address', label:'Address' }, { key:'country', label:'Country' },
      { key:'domain', label:'Domain' },
    ]},
    { title: 'Contacts', fields: [
      { key:'contact_email', label:'Contact Email' }, { key:'contact_phone', label:'Contact Phone' },
    ]},
    { title: 'Finance', fields: [
      { key:'currency', label:'Currency' }, { key:'tax_label', label:'Tax Label' },
      { key:'tax_rate', label:'Tax Rate %', type:'number' },
      { key:'commission_rate_percent', label:'Commission Rate %', type:'number' },
      { key:'invoice_prefix', label:'Invoice Prefix' }, { key:'vat_number', label:'VAT Number' },
      { key:'payment_instructions', label:'Payment Instructions' },
    ]},
    { title: 'Email (SMTP)', fields: [
      { key:'smtp_host', label:'SMTP Host' }, { key:'smtp_port', label:'SMTP Port', type:'number' },
      { key:'smtp_user', label:'SMTP User' }, { key:'smtp_pass', label:'SMTP Password', type:'password' },
      { key:'smtp_from', label:'From Email' },
    ]},
  ];

  if (!selected) return <div className="p-12 text-center text-gray-400">Loading…</div>;

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-primary mb-6">Settings</h1>

      {properties.length > 1 && (
        <div className="flex gap-2 mb-6">
          {properties.map(p => (
            <button key={p.id} onClick={() => selectProp(p)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border ${selected.id===p.id ? 'bg-primary text-white border-primary' : 'border-gray-300 text-gray-600 hover:border-primary'}`}>
              {p.name}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-8">
        {sections.map(section => (
          <div key={section.title} className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-700 mb-4">{section.title}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {section.fields.map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                  <input type={f.type||'text'} value={form[f.key]||''} onChange={e => setForm(p=>({...p,[f.key]:e.target.value}))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <button onClick={save} disabled={saving} className="bg-gold text-white px-6 py-2 rounded-lg font-medium hover:opacity-90 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
