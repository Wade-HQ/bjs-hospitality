import React, { useState, useEffect } from 'react';
import api from '../../api/index.js';
import { useToast } from '../../contexts/ToastContext.jsx';

export default function Settings() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);

  const [general, setGeneral] = useState({
    ota_name: 'Sun Safari Destinations',
    contact_email: 'bookings@sunsafaridestinations.co.za',
    contact_phone: '',
    website_url: '',
    default_currency: 'ZAR',
    default_commission_rate: '',
    booking_ref_prefix: 'SSD',
    tax_rate: '',
  });

  const [smtp, setSmtp] = useState({
    smtp_host: '',
    smtp_port: '587',
    smtp_user: '',
    smtp_pass: '',
    smtp_from_name: '',
    smtp_from_email: '',
  });

  const [notifications, setNotifications] = useState({
    notify_new_booking: true,
    notify_payment_received: true,
    notify_commission_due: true,
    notify_check_in: false,
    notification_email: '',
  });

  useEffect(() => {
    api.get('/api/settings')
      .then(res => {
        const data = res.data || {};
        if (data.general) setGeneral(prev => ({ ...prev, ...data.general }));
        if (data.smtp) setSmtp(prev => ({ ...prev, ...data.smtp }));
        if (data.notifications) setNotifications(prev => ({ ...prev, ...data.notifications }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSaveGeneral = async () => {
    setSaving(true);
    try {
      await api.put('/api/settings', { general });
      addToast('General settings saved', 'success');
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSmtp = async () => {
    setSaving(true);
    try {
      await api.put('/api/settings', { smtp });
      addToast('SMTP settings saved', 'success');
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to save SMTP settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotifications = async () => {
    setSaving(true);
    try {
      await api.put('/api/settings', { notifications });
      addToast('Notification settings saved', 'success');
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to save notification settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTestSmtp = async () => {
    setTestingSmtp(true);
    try {
      await api.post('/api/settings/test-smtp');
      addToast('Test email sent successfully!', 'success');
    } catch (err) {
      addToast(err.response?.data?.error || 'SMTP test failed — check your configuration', 'error');
    } finally {
      setTestingSmtp(false);
    }
  };

  const setG = (k, v) => setGeneral(s => ({ ...s, [k]: v }));
  const setS = (k, v) => setSmtp(s => ({ ...s, [k]: v }));
  const setN = (k, v) => setNotifications(s => ({ ...s, [k]: v }));

  const CURRENCIES = ['ZAR', 'USD', 'EUR', 'GBP', 'MZN'];

  if (loading) {
    return (
      <div className="space-y-4 max-w-2xl">
        {[1, 2].map(i => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 h-48 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/3 mb-4" />
            <div className="space-y-3">
              <div className="h-4 bg-gray-100 rounded" />
              <div className="h-4 bg-gray-100 rounded w-3/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* General Settings */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-primary mb-5">General Settings</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">OTA NAME</label>
              <input
                type="text"
                value={general.ota_name}
                onChange={e => setG('ota_name', e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">BOOKING REF PREFIX</label>
              <input
                type="text"
                value={general.booking_ref_prefix}
                onChange={e => setG('booking_ref_prefix', e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal font-mono uppercase"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">CONTACT EMAIL</label>
              <input
                type="email"
                value={general.contact_email}
                onChange={e => setG('contact_email', e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">CONTACT PHONE</label>
              <input
                type="tel"
                value={general.contact_phone}
                onChange={e => setG('contact_phone', e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">DEFAULT CURRENCY</label>
              <select
                value={general.default_currency}
                onChange={e => setG('default_currency', e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
              >
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">DEFAULT COMMISSION (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={general.default_commission_rate}
                onChange={e => setG('default_commission_rate', e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
                placeholder="e.g. 15"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">WEBSITE URL</label>
              <input
                type="url"
                value={general.website_url}
                onChange={e => setG('website_url', e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">TAX RATE (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={general.tax_rate}
                onChange={e => setG('tax_rate', e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
                placeholder="e.g. 15 (VAT)"
              />
            </div>
          </div>
          <div className="pt-2">
            <button
              onClick={handleSaveGeneral}
              disabled={saving}
              className="bg-primary hover:bg-primary/90 disabled:opacity-60 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            >
              {saving ? 'Saving...' : 'Save General Settings'}
            </button>
          </div>
        </div>
      </div>

      {/* SMTP Settings */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-primary mb-1">Email / SMTP Settings</h2>
        <p className="text-gray-400 text-xs mb-5">Configure outgoing email for booking confirmations and notifications</p>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">SMTP HOST</label>
              <input
                type="text"
                value={smtp.smtp_host}
                onChange={e => setS('smtp_host', e.target.value)}
                placeholder="smtp-relay.brevo.com"
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">PORT</label>
              <input
                type="number"
                value={smtp.smtp_port}
                onChange={e => setS('smtp_port', e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">SMTP USERNAME</label>
              <input
                type="text"
                value={smtp.smtp_user}
                onChange={e => setS('smtp_user', e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">SMTP PASSWORD</label>
              <input
                type="password"
                value={smtp.smtp_pass}
                onChange={e => setS('smtp_pass', e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
                placeholder="••••••••"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">FROM NAME</label>
              <input
                type="text"
                value={smtp.smtp_from_name}
                onChange={e => setS('smtp_from_name', e.target.value)}
                placeholder="Sun Safari Destinations"
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">FROM EMAIL</label>
              <input
                type="email"
                value={smtp.smtp_from_email}
                onChange={e => setS('smtp_from_email', e.target.value)}
                placeholder="bookings@sunsafaridestinations.co.za"
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSaveSmtp}
              disabled={saving}
              className="bg-primary hover:bg-primary/90 disabled:opacity-60 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            >
              {saving ? 'Saving...' : 'Save SMTP'}
            </button>
            <button
              onClick={handleTestSmtp}
              disabled={testingSmtp}
              className="border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-60 px-6 py-2.5 rounded-xl text-sm font-medium transition-colors"
            >
              {testingSmtp ? 'Sending...' : 'Send Test Email'}
            </button>
          </div>
        </div>
      </div>

      {/* Notification Settings */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-primary mb-1">Notification Settings</h2>
        <p className="text-gray-400 text-xs mb-5">Control which events trigger email notifications</p>
        <div className="space-y-3 mb-5">
          {[
            { key: 'notify_new_booking', label: 'New booking received', desc: 'Email when a new booking is submitted' },
            { key: 'notify_payment_received', label: 'Payment received', desc: 'Email when a payment is recorded' },
            { key: 'notify_commission_due', label: 'Commission due reminder', desc: 'Email when commission becomes due or overdue' },
            { key: 'notify_check_in', label: 'Check-in reminder', desc: 'Email reminder 24h before guest check-in' },
          ].map(item => (
            <label key={item.key} className="flex items-start gap-3 cursor-pointer py-2 border-b border-gray-50">
              <input
                type="checkbox"
                checked={!!notifications[item.key]}
                onChange={e => setN(item.key, e.target.checked)}
                className="w-4 h-4 mt-0.5 text-teal border-gray-300 rounded"
              />
              <div>
                <p className="text-sm font-medium text-gray-700">{item.label}</p>
                <p className="text-xs text-gray-400">{item.desc}</p>
              </div>
            </label>
          ))}
        </div>
        <div className="mb-5">
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">NOTIFICATION EMAIL</label>
          <input
            type="email"
            value={notifications.notification_email}
            onChange={e => setN('notification_email', e.target.value)}
            placeholder="Send notifications to this email"
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
          />
        </div>
        <button
          onClick={handleSaveNotifications}
          disabled={saving}
          className="bg-primary hover:bg-primary/90 disabled:opacity-60 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-colors"
        >
          {saving ? 'Saving...' : 'Save Notifications'}
        </button>
      </div>
    </div>
  );
}
