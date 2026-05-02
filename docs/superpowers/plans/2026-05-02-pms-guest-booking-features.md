# PMS Guest & Booking Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add guest document upload UI + returning guest indicator, full booking edit (change guest/room/dates/recalculate), and calendar room swap to the Kudu PMS.

**Architecture:** Four self-contained tasks sharing the same React + Express + SQLite stack. Document upload backend already exists (multer, `POST /api/guests/:id/documents`). Booking PUT already exists but needs `guest_id`, `region`, `meal_package_id`, `source` added. Room swap needs a new `POST /api/bookings/:id/swap-room` endpoint plus calendar sidebar UI.

**Tech Stack:** React 18 + Tailwind CSS, Express.js, better-sqlite3, multer (already installed), existing Modal component at `pms/client/src/components/Modal.jsx`

---

## Files to Create/Modify

| File | Change |
|------|--------|
| `pms/routes/guests.js` | Add `GET /:id/documents/:doc_id/download` route |
| `pms/client/src/pages/dashboard/GuestProfile.jsx` | Add documents section + upload UI + returning guest banner |
| `pms/routes/bookings.js` | Add `guest_id`, `region`, `meal_package_id`, `source` to PUT handler; add `POST /:id/swap-room` |
| `pms/client/src/pages/dashboard/BookingDetail.jsx` | Add Edit Booking modal |
| `pms/client/src/components/BookingCalendar.jsx` | Add Swap Room button + room list sub-panel in sidebar |
| `pms/client/src/App.jsx` | Key ErrorBoundary by pathname so it resets on navigation |

---

### Task 1: Guest Document Download Route

**Files:**
- Modify: `pms/routes/guests.js` (after the DELETE route at line ~217)

Context: Files are stored at `/opt/bjs-hospitality/uploads/documents/guests/{guest_id}/{timestamp}-{filename}` (set by multer in `pms/middleware/upload.js`). The DB stores `file_path` (absolute) and `file_name`. We add a download route that streams the file back using `res.sendFile`.

- [ ] **Step 1: Add the download route** — insert before `module.exports = router;` at the end of `pms/routes/guests.js`:

```js
// GET /api/guests/:id/documents/:doc_id/download
router.get('/:id/documents/:doc_id/download', requireAuth, (req, res) => {
  const db = getDb();
  const doc = db.prepare(`
    SELECT gd.* FROM guest_documents gd
    JOIN guests g ON g.id = gd.guest_id
    WHERE gd.id = ? AND gd.guest_id = ?
      AND (g.property_id = ? OR EXISTS (
        SELECT 1 FROM bookings b WHERE b.guest_id = g.id AND b.property_id = ?
      ))
  `).get(req.params.doc_id, req.params.id, PROPERTY_ID(), PROPERTY_ID());

  if (!doc) return res.status(404).json({ error: 'Document not found' });

  const fs = require('fs');
  if (!fs.existsSync(doc.file_path)) {
    return res.status(404).json({ error: 'File not found on disk' });
  }

  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.file_name)}"`);
  res.sendFile(doc.file_path);
});
```

- [ ] **Step 2: Commit**

```bash
git add pms/routes/guests.js
git commit -m "feat: guest document download route"
```

---

### Task 2: Guest Profile — Documents UI + Returning Guest Banner

**Files:**
- Modify: `pms/client/src/pages/dashboard/GuestProfile.jsx`

Context:
- `GET /api/guests/:id` returns `{ guest, documents, bookings }` — `documents` is already fetched but ignored in the current UI.
- The `load()` function was fixed to use `r.data.guest`, but doesn't capture `r.data.documents`.
- Upload uses `POST /api/guests/:id/documents` with multer field name `'file'` (NOT `'document'`).
- The returning guest banner should show when `bookings.length > 1` (more than current booking).
- Current component state: `guest, bookings, editing, form`.

- [ ] **Step 1: Replace the state declarations and load/save/handlers block** — replace from `const [guest, setGuest]` down through the `save` function with:

```jsx
  const [guest, setGuest] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState('passport');
  const fileInputRef = React.useRef(null);

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
```

Note: `React` must be in scope for `React.useRef`. The file already imports React, so this is fine. The `useRef` import may need to be added to the destructured imports if React is imported as `import React, { useState, useEffect } from 'react'` — just add `useRef` to the destructured list.

- [ ] **Step 2: Add the returning guest banner** — add this block right after `if (!guest) return ...` and before the `return (` of the main JSX:

This goes inside the main `return (` JSX, as the very first child of `<div className="max-w-5xl">`:

```jsx
      {bookings.length > 1 && (
        <div className="mb-4 flex items-center gap-3 bg-teal/10 border border-teal/30 rounded-xl px-5 py-3 text-sm text-teal font-medium">
          <span className="text-lg">★</span>
          Returning guest — {bookings.length} stays on record. Documents may already be on file below.
        </div>
      )}
```

- [ ] **Step 3: Add the documents section** — add this block after the closing `</div>` of the profile card (the `bg-white rounded-xl border border-gray-200 p-6 mb-6` div) and before the booking history table div:

```jsx
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
                  className="text-xs text-teal hover:underline font-medium"
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
```

- [ ] **Step 4: Commit**

```bash
git add pms/client/src/pages/dashboard/GuestProfile.jsx
git commit -m "feat: guest document upload UI + returning guest indicator"
```

---

### Task 3: Booking PUT — Add guest_id, region, meal_package_id, source

**Files:**
- Modify: `pms/routes/bookings.js` (PUT handler at line 514)

Context: The current PUT handler at line 514 only handles `room_id, room_type_id, check_in, check_out, adults, children, special_requests, internal_notes, channel_booking_ref, status, payment_status, discount_amount, extras_json`. It does NOT handle `guest_id`, `region`, `meal_package_id`, or `source`. The recalculation (lines 556-575) hardcodes `existing.region` and `existing.meal_package_id`, so updating region/meals in the UI wouldn't recalculate correctly.

- [ ] **Step 1: Replace the destructuring block** — find these exact lines (around line 519):

```js
  const {
    room_id, room_type_id, check_in, check_out,
    adults, children, special_requests, internal_notes,
    channel_booking_ref, status, payment_status,
    discount_amount, extras_json
  } = req.body;
```

Replace with:

```js
  const {
    room_id, room_type_id, check_in, check_out,
    adults, children, special_requests, internal_notes,
    channel_booking_ref, status, payment_status,
    discount_amount, extras_json,
    guest_id, region, meal_package_id, source,
  } = req.body;

  if (guest_id !== undefined) {
    const guestExists = db.prepare('SELECT id FROM guests WHERE id = ?').get(guest_id);
    if (!guestExists) return res.status(400).json({ error: 'Guest not found' });
  }
  if (region !== undefined && !['international', 'sadc'].includes(region)) {
    return res.status(400).json({ error: 'region must be international or sadc' });
  }
```

- [ ] **Step 2: Fix the recalculation to use incoming region and meal_package_id** — find these lines inside the `if (check_in || check_out || discount_amount !== undefined || extras_json !== undefined)` block:

```js
      const pricing = calculateBookingPrice(db, {
        property_id: PROPERTY_ID(),
        room_type_id: existing.room_type_id,
        region: existing.region || 'international',
        check_in: newCheckIn,
        check_out: newCheckOut,
        nights,
        adults: parseInt(adults !== undefined ? adults : existing.adults),
        children: parseInt(children !== undefined ? children : existing.children),
        meal_package_id: existing.meal_package_id,
      });
```

Replace with:

```js
      const pricing = calculateBookingPrice(db, {
        property_id: PROPERTY_ID(),
        room_type_id: room_type_id || existing.room_type_id,
        region: region !== undefined ? region : (existing.region || 'international'),
        check_in: newCheckIn,
        check_out: newCheckOut,
        nights,
        adults: parseInt(adults !== undefined ? adults : existing.adults),
        children: parseInt(children !== undefined ? children : existing.children),
        meal_package_id: meal_package_id !== undefined ? meal_package_id : existing.meal_package_id,
      });
```

- [ ] **Step 3: Add guest_id, region, meal_package_id, source to the UPDATE SQL** — find the `db.prepare(` UPDATE bookings SET` block and add to the SET clause and the `.run()` call:

In the SET clause, add after `payment_status = COALESCE(?, payment_status),`:
```sql
      guest_id = COALESCE(?, guest_id),
      region = COALESCE(?, region),
      meal_package_id = COALESCE(?, meal_package_id),
      source = COALESCE(?, source),
```

In the `.run()` call, add after `status || null, payment_status || null,`:
```js
    guest_id || null, region || null,
    meal_package_id !== undefined ? (meal_package_id || null) : null, source || null,
```

- [ ] **Step 4: Commit**

```bash
git add pms/routes/bookings.js
git commit -m "feat: booking PUT supports guest_id, region, meal_package_id, source changes"
```

---

### Task 4: Booking Edit Modal — Frontend

**Files:**
- Modify: `pms/client/src/pages/dashboard/BookingDetail.jsx`

Context: Currently shows status buttons and "+ Payment" modal. We add an "Edit Booking" button that opens a modal with full booking edit: dates, region, room type, room, adults/children, meal package, guest (searchable), source, special requests. Shows live price preview (same as NewBooking.jsx).

The existing file structure:
- State: `booking, loading, updating, payModal, pay`
- `load()` fetches `/api/bookings/${id}` → sets `booking`
- `const b = booking.booking;` extracts the booking object
- Action buttons row: `<div className="flex flex-wrap gap-3 mb-6">`
- One Modal already present (payment modal)

- [ ] **Step 1: Add edit state declarations** — add after the existing state declarations (after `const [pay, setPay] = ...`):

```jsx
  const [editModal, setEditModal] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [editRoomTypes, setEditRoomTypes] = useState([]);
  const [editRooms, setEditRooms] = useState([]);
  const [editMealPackages, setEditMealPackages] = useState([]);
  const [editPreview, setEditPreview] = useState(null);
  const [editPreviewLoading, setEditPreviewLoading] = useState(false);
  const [guestSearch, setGuestSearch] = useState('');
  const [guestResults, setGuestResults] = useState([]);
```

- [ ] **Step 2: Add openEditModal, useEffects, and saveEdit** — add after the `downloadInvoice` function:

```jsx
  const openEditModal = () => {
    const b = booking.booking;
    setEditForm({
      check_in: b.check_in,
      check_out: b.check_out,
      room_type_id: String(b.room_type_id || ''),
      room_id: String(b.room_id || ''),
      adults: b.adults,
      children: b.children || 0,
      region: b.region || 'international',
      meal_package_id: b.meal_package_id ? String(b.meal_package_id) : '',
      guest_id: b.guest_id,
      guest_name: `${b.first_name} ${b.last_name}`,
      special_requests: b.special_requests || '',
      source: b.source || 'direct',
    });
    setGuestSearch('');
    setGuestResults([]);
    setEditPreview(null);
    Promise.all([
      api.get('/api/room-types'),
      api.get('/api/meal-packages'),
    ]).then(([rtRes, mpRes]) => {
      setEditRoomTypes(rtRes.data?.room_types || []);
      setEditMealPackages(mpRes.data?.meal_packages || []);
    });
    setEditModal(true);
  };

  const saveEdit = async () => {
    setUpdating(true);
    try {
      await api.put(`/api/bookings/${id}`, {
        check_in: editForm.check_in,
        check_out: editForm.check_out,
        room_type_id: editForm.room_type_id || null,
        room_id: editForm.room_id || null,
        adults: Number(editForm.adults),
        children: Number(editForm.children || 0),
        region: editForm.region,
        meal_package_id: editForm.meal_package_id || null,
        guest_id: editForm.guest_id,
        special_requests: editForm.special_requests || null,
        source: editForm.source,
      });
      addToast('Booking updated');
      setEditModal(false);
      load();
    } catch (e) {
      addToast(e.response?.data?.error || 'Error updating booking', 'error');
    } finally {
      setUpdating(false);
    }
  };
```

- [ ] **Step 3: Add useEffects for room loading, guest search, and price preview** — add after the `saveEdit` function (these must be at component top level, not inside a function):

```jsx
  useEffect(() => {
    if (!editForm.room_type_id || !editModal) return;
    api.get('/api/rooms', { params: { room_type_id: editForm.room_type_id } })
      .then(r => setEditRooms(r.data?.rooms || []));
  }, [editForm.room_type_id, editModal]);

  useEffect(() => {
    if (!guestSearch.trim() || guestSearch.length < 2) { setGuestResults([]); return; }
    const timer = setTimeout(() => {
      api.get('/api/guests', { params: { search: guestSearch } })
        .then(r => setGuestResults((r.data?.guests || []).slice(0, 6)));
    }, 300);
    return () => clearTimeout(timer);
  }, [guestSearch]);

  useEffect(() => {
    const { room_type_id, region, check_in, check_out, adults, children, meal_package_id } = editForm;
    if (!room_type_id || !check_in || !check_out || !adults || !editModal) { setEditPreview(null); return; }
    if (new Date(check_out) <= new Date(check_in)) { setEditPreview(null); return; }
    const timer = setTimeout(async () => {
      setEditPreviewLoading(true);
      try {
        const params = new URLSearchParams({ room_type_id, region: region || 'international', check_in, check_out, adults, children: children || 0 });
        if (meal_package_id) params.set('meal_package_id', meal_package_id);
        const r = await api.get(`/api/bookings/price-preview?${params}`);
        setEditPreview(r.data);
      } catch { setEditPreview(null); }
      finally { setEditPreviewLoading(false); }
    }, 350);
    return () => clearTimeout(timer);
  }, [editForm.room_type_id, editForm.region, editForm.check_in, editForm.check_out, editForm.adults, editForm.children, editForm.meal_package_id, editModal]);
```

- [ ] **Step 4: Add "Edit Booking" button** — in the action buttons row `<div className="flex flex-wrap gap-3 mb-6">`, add this button after the Invoice PDF button:

```jsx
        <button onClick={openEditModal} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">Edit Booking</button>
```

- [ ] **Step 5: Add the Edit Booking Modal JSX** — add after the closing `</Modal>` of the payment modal:

```jsx
      <Modal open={editModal} onClose={() => setEditModal(false)} title="Edit Booking">
        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          {/* Guest */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Guest</label>
            <div className="flex items-center gap-2 mb-1 text-sm">
              <span className="font-medium text-teal">{editForm.guest_name}</span>
              <span className="text-gray-300">·</span>
              <button type="button" onClick={() => setGuestSearch('')} className="text-xs text-gray-400 hover:text-gray-600">Change guest</button>
            </div>
            <input
              type="text"
              placeholder="Search by name or email…"
              value={guestSearch}
              onChange={e => setGuestSearch(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            {guestResults.length > 0 && (
              <div className="absolute z-10 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg mt-1">
                {guestResults.map(g => (
                  <div key={g.id}
                    className="px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm flex items-center justify-between"
                    onClick={() => {
                      setEditForm(p => ({ ...p, guest_id: g.id, guest_name: `${g.first_name} ${g.last_name}` }));
                      setGuestSearch('');
                      setGuestResults([]);
                    }}
                  >
                    <span>{g.first_name} {g.last_name}</span>
                    {g.email && <span className="text-gray-400 text-xs">{g.email}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            {[{k:'check_in',l:'Check-in'},{k:'check_out',l:'Check-out'}].map(f => (
              <div key={f.k}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{f.l}</label>
                <input type="date" value={editForm[f.k] || ''} onChange={e => setEditForm(p => ({...p, [f.k]: e.target.value}))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            ))}
          </div>

          {/* Region */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Region</label>
            <select value={editForm.region || 'international'} onChange={e => setEditForm(p => ({...p, region: e.target.value}))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="international">International</option>
              <option value="sadc">SADC</option>
            </select>
          </div>

          {/* Room Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Room Type</label>
            <select value={editForm.room_type_id || ''} onChange={e => setEditForm(p => ({...p, room_type_id: e.target.value, room_id: ''}))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">Select room type</option>
              {editRoomTypes.map(rt => <option key={rt.id} value={rt.id}>{rt.name}</option>)}
            </select>
          </div>

          {/* Room */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Room</label>
            <select value={editForm.room_id || ''} onChange={e => setEditForm(p => ({...p, room_id: e.target.value}))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">Keep current / auto-assign</option>
              {editRooms.map(r => <option key={r.id} value={r.id}>Room {r.room_number}</option>)}
            </select>
          </div>

          {/* Adults + Children */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Adults</label>
              <input type="number" min={1} value={editForm.adults || 1} onChange={e => setEditForm(p => ({...p, adults: parseInt(e.target.value)}))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Children</label>
              <input type="number" min={0} value={editForm.children || 0} onChange={e => setEditForm(p => ({...p, children: parseInt(e.target.value)}))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>

          {/* Meal Package */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Meal Package</label>
            <select value={editForm.meal_package_id || ''} onChange={e => setEditForm(p => ({...p, meal_package_id: e.target.value}))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">Room Only</option>
              {editMealPackages.map(mp => <option key={mp.id} value={mp.id}>{mp.name}</option>)}
            </select>
          </div>

          {/* Source */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
            <select value={editForm.source || 'direct'} onChange={e => setEditForm(p => ({...p, source: e.target.value}))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {[['direct','Direct'],['booking_com','Booking.com'],['airbnb','Airbnb'],['expedia','Expedia'],['google','Google'],['ota_internal','Other OTA']].map(([v,l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          {/* Special Requests */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Special Requests</label>
            <textarea rows={2} value={editForm.special_requests || ''} onChange={e => setEditForm(p => ({...p, special_requests: e.target.value}))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>

          {/* Price Preview */}
          {(editPreview || editPreviewLoading) && (
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
              {editPreviewLoading ? (
                <div className="text-sm text-gray-400 text-center animate-pulse">Calculating…</div>
              ) : editPreview && (
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Accommodation</span><span>{editPreview.accommodation_subtotal?.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span></div>
                  {editPreview.meal_total > 0 && <div className="flex justify-between"><span className="text-gray-500">Meals</span><span>{editPreview.meal_total?.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span></div>}
                  <div className="flex justify-between"><span className="text-gray-500">Tax</span><span>{editPreview.tax_amount?.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span></div>
                  <div className="flex justify-between border-t border-gray-200 pt-1 font-semibold text-primary">
                    <span>New Total</span>
                    <span>{editPreview.total_amount?.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setEditModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
          <button onClick={saveEdit} disabled={updating} className="px-4 py-2 bg-gold text-white rounded-lg text-sm font-medium disabled:opacity-50">
            {updating ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </Modal>
```

- [ ] **Step 6: Commit**

```bash
git add pms/client/src/pages/dashboard/BookingDetail.jsx
git commit -m "feat: booking edit modal - change guest, room, dates, region, meals, recalculate"
```

---

### Task 5: Calendar Room Swap — Backend + Frontend

**Files:**
- Modify: `pms/routes/bookings.js` (add `POST /:id/swap-room` before `module.exports`)
- Modify: `pms/client/src/components/BookingCalendar.jsx`

#### 5a: Backend swap-room endpoint

- [ ] **Step 1: Add swap-room route** — add before the final `module.exports = router;` in `pms/routes/bookings.js`:

```js
// POST /api/bookings/:id/swap-room
router.post('/:id/swap-room', requireAuth, requireRole('owner','hotel_manager','front_desk'), (req, res) => {
  const db = getDb();
  const { target_room_id } = req.body;
  if (!target_room_id) return res.status(400).json({ error: 'target_room_id is required' });

  const booking = db.prepare('SELECT * FROM bookings WHERE id = ? AND property_id = ?')
    .get(req.params.id, PROPERTY_ID());
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  if (['cancelled', 'checked_out', 'no_show'].includes(booking.status)) {
    return res.status(400).json({ error: 'Cannot swap room on a completed/cancelled booking' });
  }

  const targetRoom = db.prepare('SELECT * FROM rooms WHERE id = ? AND property_id = ?')
    .get(target_room_id, PROPERTY_ID());
  if (!targetRoom) return res.status(404).json({ error: 'Target room not found' });

  const conflict = db.prepare(`
    SELECT id, booking_ref FROM bookings
    WHERE room_id = ? AND property_id = ? AND id != ?
      AND status NOT IN ('cancelled','no_show','checked_out')
      AND check_in < ? AND check_out > ?
  `).get(target_room_id, PROPERTY_ID(), booking.id, booking.check_out, booking.check_in);

  if (conflict) {
    return res.status(409).json({ error: `Room already booked (${conflict.booking_ref}) for those dates` });
  }

  db.prepare('UPDATE bookings SET room_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(target_room_id, booking.id);

  db.prepare(`INSERT INTO booking_audit_log (booking_id, user_id, action, old_value, new_value) VALUES (?, ?, 'room_swapped', ?, ?)`)
    .run(booking.id, req.user.id, String(booking.room_id), String(target_room_id));

  const updated = getBookingById(db, booking.id);
  return res.json({ booking: updated, message: `Moved to room ${targetRoom.room_number || targetRoom.name}` });
});
```

- [ ] **Step 2: Commit backend**

```bash
git add pms/routes/bookings.js
git commit -m "feat: booking swap-room endpoint with conflict check"
```

#### 5b: Frontend swap UI in BookingCalendar

- [ ] **Step 3: Add swap state** — in `BookingCalendar.jsx`, find `const [actionLoading, setActionLoading] = useState(false);` and add after it:

```jsx
  const [swapMode, setSwapMode] = useState(false);
  const [swapRooms, setSwapRooms] = useState([]);
  const [swapLoading, setSwapLoading] = useState(false);
```

- [ ] **Step 4: Add swap handler functions** — add after the `handleCancel` function:

```jsx
  const openSwapMode = async () => {
    setSwapLoading(true);
    try {
      const r = await api.get('/api/rooms', {
        params: {
          available: 'true',
          check_in: selectedBooking.check_in,
          check_out: selectedBooking.check_out,
        }
      });
      setSwapRooms(r.data?.rooms || []);
      setSwapMode(true);
    } catch {
      addToast('Failed to load available rooms', 'error');
    } finally {
      setSwapLoading(false);
    }
  };

  const handleSwapRoom = async (targetRoomId, targetRoomLabel) => {
    if (!window.confirm(`Move this booking to ${targetRoomLabel}?`)) return;
    setActionLoading(true);
    try {
      await api.post(`/api/bookings/${selectedBooking.id}/swap-room`, { target_room_id: targetRoomId });
      addToast(`Booking moved to ${targetRoomLabel}`);
      setSwapMode(false);
      setSidebarOpen(false);
      fetchData();
    } catch (err) {
      addToast(err.response?.data?.error || 'Swap failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };
```

- [ ] **Step 5: Also reset swapMode when sidebar closes** — find every call to `setSidebarOpen(false)` in the file (there are several, e.g. inside handleCheckIn, handleCheckOut, handleCancel, and the backdrop onClick). Add `setSwapMode(false)` alongside each:

```jsx
// e.g. change:
setSidebarOpen(false);
// to:
setSidebarOpen(false);
setSwapMode(false);
```

Do this for ALL occurrences of `setSidebarOpen(false)` throughout the component.

- [ ] **Step 6: Replace the entire `{/* Action Buttons */}` section** — find the section that starts with `{/* Action Buttons */}` (around line 572) and replace it entirely with:

```jsx
            {/* Action Buttons */}
            <div className="p-4 border-t border-gray-200 space-y-2">
              {swapMode ? (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-primary">Move to Room</span>
                    <button onClick={() => setSwapMode(false)} className="text-xs text-gray-400 hover:text-gray-600">← Back</button>
                  </div>
                  {swapRooms.filter(r => r.id !== selectedBooking.room_id).length === 0 ? (
                    <div className="text-xs text-gray-400 text-center py-3">No other rooms available for these dates</div>
                  ) : (
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {swapRooms
                        .filter(r => r.id !== selectedBooking.room_id)
                        .map(r => (
                          <button
                            key={r.id}
                            onClick={() => handleSwapRoom(r.id, r.room_number || r.name)}
                            disabled={actionLoading}
                            className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-teal/10 border border-gray-200 rounded-lg text-sm transition-colors disabled:opacity-50"
                          >
                            <span className="font-medium">{r.room_number || r.name}</span>
                            <span className="text-xs text-gray-400">{r.room_type_name}</span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {(selectedBooking.status === 'confirmed' || selectedBooking.status === 'provisional') && (
                    <button onClick={handleCheckIn} disabled={actionLoading}
                      className="w-full py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">
                      Check In
                    </button>
                  )}
                  {selectedBooking.status === 'checked_in' && (
                    <button onClick={handleCheckOut} disabled={actionLoading}
                      className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                      Check Out
                    </button>
                  )}
                  <button onClick={() => navigate(`/dashboard/bookings/${selectedBooking.id}`)}
                    className="w-full py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
                    View Full Detail
                  </button>
                  {selectedBooking.status !== 'cancelled' && selectedBooking.status !== 'checked_out' && (
                    <button onClick={openSwapMode} disabled={swapLoading}
                      className="w-full py-2 border border-gray-300 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors">
                      {swapLoading ? 'Loading rooms…' : '⇄ Swap Room'}
                    </button>
                  )}
                  {selectedBooking.status !== 'cancelled' && selectedBooking.status !== 'checked_out' && (
                    <button onClick={handleCancel} disabled={actionLoading}
                      className="w-full py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors">
                      Cancel Booking
                    </button>
                  )}
                </>
              )}
            </div>
```

- [ ] **Step 7: Commit frontend**

```bash
git add pms/client/src/components/BookingCalendar.jsx
git commit -m "feat: calendar room swap - shows available rooms, confirms before swapping"
```

---

### Task 6: Fix ErrorBoundary Reset on Navigation

**Files:**
- Modify: `pms/client/src/App.jsx`

Context: The ErrorBoundary in `ProtectedLayout` wraps the `<Outlet />`. When a page crashes, the boundary shows "Something went wrong". If the user navigates to another page (clicks a nav item), the error persists because the boundary component doesn't unmount. Adding `key={location.pathname}` to `<ErrorBoundary>` causes React to fully remount it (and clear the error) on every route change.

Current code in `pms/client/src/App.jsx` (lines 24-39):
```jsx
function ProtectedLayout() {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-primary">
      <div className="text-white/70 text-sm animate-pulse">Loading...</div>
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return (
    <DashboardLayout>
      <ErrorBoundary>
        <Outlet />
      </ErrorBoundary>
    </DashboardLayout>
  );
}
```

- [ ] **Step 1: Add `useLocation` import and key the ErrorBoundary** — update `ProtectedLayout`:

```jsx
function ProtectedLayout() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-primary">
      <div className="text-white/70 text-sm animate-pulse">Loading...</div>
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return (
    <DashboardLayout>
      <ErrorBoundary key={location.pathname}>
        <Outlet />
      </ErrorBoundary>
    </DashboardLayout>
  );
}
```

Note: `useLocation` is already imported at the top of the file (it's used in `DashboardLayout.jsx`). In `App.jsx`, check the imports — `useLocation` may need to be added to the `react-router-dom` import: `import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';`

- [ ] **Step 2: Commit**

```bash
git add pms/client/src/App.jsx
git commit -m "fix: reset ErrorBoundary on navigation to clear stale error screens"
```

---

## Self-Review Checklist

- [x] Guest document download route — provides secure download with auth check
- [x] Guest document upload UI — uses FormData + `'file'` field name matching multer config
- [x] Returning guest banner — shows when `bookings.length > 1`
- [x] Booking edit — adds guest_id, region, meal_package_id, source to both frontend and backend
- [x] Recalculation uses new region/meal_package_id — fixed in Task 3 Step 2
- [x] Room swap — conflict check prevents double-booking; filters out current room from swap list
- [x] ErrorBoundary reset — `key={location.pathname}` pattern is idiomatic React
- [x] No TBD/TODO placeholders
- [x] All method names consistent across tasks
