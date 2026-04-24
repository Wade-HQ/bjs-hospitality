'use strict';
const bcrypt = require('bcrypt');

async function runMigrations(db) {
  // Enable WAL mode for concurrent access
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      type TEXT DEFAULT 'hotel' CHECK(type IN ('hotel','lodge','guesthouse')),
      address TEXT,
      country TEXT,
      currency TEXT DEFAULT 'USD',
      timezone TEXT DEFAULT 'UTC',
      commission_rate_percent REAL DEFAULT 15,
      domain TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      vat_number TEXT,
      invoice_prefix TEXT DEFAULT 'INV',
      invoice_counter INTEGER DEFAULT 0,
      tax_label TEXT DEFAULT 'VAT',
      tax_rate REAL DEFAULT 0,
      payment_instructions TEXT,
      smtp_host TEXT,
      smtp_port INTEGER,
      smtp_user TEXT,
      smtp_pass TEXT,
      smtp_from TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS room_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER NOT NULL REFERENCES properties(id),
      name TEXT NOT NULL,
      description TEXT,
      max_occupancy INTEGER DEFAULT 2,
      base_rate REAL DEFAULT 0,
      currency TEXT,
      amenities_json TEXT DEFAULT '[]',
      image_urls_json TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER NOT NULL REFERENCES properties(id),
      room_type_id INTEGER REFERENCES room_types(id),
      room_number TEXT NOT NULL,
      floor TEXT,
      status TEXT DEFAULT 'available' CHECK(status IN ('available','occupied','maintenance','blocked')),
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS guests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER REFERENCES properties(id),
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      nationality TEXT,
      id_type TEXT CHECK(id_type IN ('passport','id_card','drivers_license')),
      id_number TEXT,
      id_expiry TEXT,
      date_of_birth TEXT,
      address TEXT,
      city TEXT,
      country TEXT,
      vip_flag INTEGER DEFAULT 0,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS guest_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guest_id INTEGER NOT NULL REFERENCES guests(id),
      doc_type TEXT DEFAULT 'other' CHECK(doc_type IN ('passport','id','vehicle','other')),
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_ref TEXT UNIQUE NOT NULL,
      source TEXT DEFAULT 'direct' CHECK(source IN ('direct','ota_internal','booking_com','airbnb','expedia','google')),
      property_id INTEGER NOT NULL REFERENCES properties(id),
      room_id INTEGER REFERENCES rooms(id),
      room_type_id INTEGER REFERENCES room_types(id),
      guest_id INTEGER REFERENCES guests(id),
      check_in TEXT NOT NULL,
      check_out TEXT NOT NULL,
      nights INTEGER DEFAULT 1,
      adults INTEGER DEFAULT 1,
      children INTEGER DEFAULT 0,
      room_rate REAL DEFAULT 0,
      extras_json TEXT DEFAULT '[]',
      subtotal REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      tax_rate REAL DEFAULT 0,
      discount_amount REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      currency TEXT DEFAULT 'USD',
      commission_rate REAL DEFAULT 0,
      commission_amount REAL DEFAULT 0,
      net_to_property REAL DEFAULT 0,
      status TEXT DEFAULT 'provisional' CHECK(status IN ('provisional','confirmed','checked_in','checked_out','cancelled','no_show')),
      payment_status TEXT DEFAULT 'unpaid' CHECK(payment_status IN ('unpaid','deposit_paid','fully_paid','refunded')),
      special_requests TEXT,
      internal_notes TEXT,
      channel_booking_ref TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS booking_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL REFERENCES bookings(id),
      property_id INTEGER NOT NULL REFERENCES properties(id),
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'USD',
      payment_method TEXT DEFAULT 'bank_transfer' CHECK(payment_method IN ('cash','card','bank_transfer','eft')),
      payment_date TEXT NOT NULL,
      reference TEXT,
      notes TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT UNIQUE NOT NULL,
      booking_id INTEGER REFERENCES bookings(id),
      property_id INTEGER NOT NULL REFERENCES properties(id),
      issued_to TEXT DEFAULT 'guest' CHECK(issued_to IN ('guest','ota','property')),
      recipient_name TEXT,
      recipient_email TEXT,
      recipient_address TEXT,
      line_items_json TEXT DEFAULT '[]',
      subtotal REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      currency TEXT DEFAULT 'USD',
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft','sent','paid','overdue','cancelled')),
      due_date TEXT,
      paid_date TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER NOT NULL REFERENCES properties(id),
      room_type_id INTEGER REFERENCES room_types(id),
      name TEXT NOT NULL,
      rate_per_night REAL NOT NULL,
      currency TEXT DEFAULT 'USD',
      valid_from TEXT,
      valid_to TEXT,
      min_nights INTEGER DEFAULT 1,
      max_nights INTEGER,
      days_of_week_json TEXT DEFAULT '[0,1,2,3,4,5,6]',
      channel TEXT DEFAULT 'all' CHECK(channel IN ('all','direct','ota')),
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS availability_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER NOT NULL REFERENCES properties(id),
      room_id INTEGER NOT NULL REFERENCES rooms(id),
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      reason TEXT DEFAULT 'blocked' CHECK(reason IN ('maintenance','owner','blocked','channel_sync')),
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS channel_sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER REFERENCES properties(id),
      booking_id INTEGER REFERENCES bookings(id),
      channel TEXT,
      direction TEXT CHECK(direction IN ('inbound','outbound')),
      status TEXT DEFAULT 'pending' CHECK(status IN ('success','failed','pending')),
      payload_json TEXT,
      error_message TEXT,
      synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ota_commissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL REFERENCES bookings(id),
      ota_property_id INTEGER REFERENCES properties(id),
      hotel_property_id INTEGER NOT NULL REFERENCES properties(id),
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'USD',
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','due','paid','overdue')),
      due_date TEXT,
      paid_date TEXT,
      payment_ref TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER REFERENCES properties(id),
      type TEXT CHECK(type IN ('payment_due','commission_due','new_booking','cancellation','check_in_today','check_out_today','document_missing','commission_overdue')),
      title TEXT NOT NULL,
      message TEXT,
      related_id INTEGER,
      related_type TEXT,
      read_flag INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'front_desk' CHECK(role IN ('owner','hotel_manager','front_desk','accountant','ota_admin')),
      property_access_json TEXT DEFAULT '[]',
      active INTEGER DEFAULT 1,
      force_password_change INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      token TEXT UNIQUE NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ical_feeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER NOT NULL REFERENCES properties(id),
      room_id INTEGER REFERENCES rooms(id),
      channel TEXT,
      feed_url TEXT,
      last_synced DATETIME,
      sync_interval_minutes INTEGER DEFAULT 60,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS google_hotel_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER NOT NULL REFERENCES properties(id),
      room_type_id INTEGER REFERENCES room_types(id),
      display_rate REAL,
      currency TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS booking_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL REFERENCES bookings(id),
      user_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed properties if empty
  const propCount = db.prepare('SELECT COUNT(*) as c FROM properties').get();
  if (propCount.c === 0) {
    db.prepare(`INSERT INTO properties (id,name,slug,type,country,currency,timezone,commission_rate_percent,domain,contact_email,contact_phone,invoice_prefix,tax_label,tax_rate)
      VALUES (1,'Sky Island Resort & Safari','sky-island','lodge','MZ','ZAR','Africa/Johannesburg',15,'skyisland.bluejungle.solutions','office@skyislandresort.com','+258850362730','SKY','VAT',15)`).run();
    db.prepare(`INSERT INTO properties (id,name,slug,type,country,currency,timezone,commission_rate_percent,domain,contact_email,invoice_prefix,tax_label,tax_rate)
      VALUES (2,'Ponta Membene Lodge','ponta-membene','lodge','MZ','MZN','Africa/Maputo',15,'membene.bluejungle.solutions','info@pontamembene.co.mz','PMB','IVA',17)`).run();
    console.log('Seeded 2 properties');
  } else {
    // Keep property details up to date
    db.prepare(`UPDATE properties SET
      name='Sky Island Resort & Safari', type='lodge', country='MZ',
      contact_email='office@skyislandresort.com', contact_phone='+258850362730'
      WHERE id=1 AND name='Sky Island Resort'`).run();
  }

  // Seed admin user if empty
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get();
  if (userCount.c === 0) {
    const hash = bcrypt.hashSync('ChangeMeNow123!', 12);
    db.prepare(`INSERT INTO users (name,email,password_hash,role,property_access_json,force_password_change)
      VALUES ('Admin','admin@bluejungle.solutions',?,?,'[1,2]',1)`)
      .run(hash, 'owner');
    console.log('Seeded admin user: admin@bluejungle.solutions / ChangeMeNow123!');
  }

  // ── Sky Island room types (idempotent by name) ─────────────────────────────
  const WIX = 'https://static.wixstatic.com/media';
  const SKY_ROOM_TYPES = [
    {
      name: 'Meadow Chalet',
      description: 'Self-catering chalets nestled in unspoiled nature with sweeping views of the open grassy fields. Built with natural materials, each chalet offers a full kitchenette and private patio — the perfect base for exploring the ridge and coastline.',
      max_occupancy: 3,
      base_rate: 3127,
      amenities: ['Kitchenette (stove, fridge, microwave, kettle)', 'King bed + sleeper couch', 'En-suite bathroom', 'Outside hot & cold shower', 'Smart TV', 'Overhead fan', 'Private patio', 'Braai (BBQ) facilities', 'Free Wi-Fi', 'Room service', 'Breakfast available'],
      images: [
        `${WIX}/57b862_6c4937616344464a897e0d05174bd386~mv2.jpg`,
      ],
    },
    {
      name: 'Food Forest Safari Tent',
      description: 'Large luxury safari tents overlooking the resort\'s organic food forest and garden — a true glamping experience. Soft white linens, private outdoor shower, and the sounds of nature surround you.',
      max_occupancy: 3,
      base_rate: 1307,
      amenities: ['King bed or 2 single beds', 'Private outdoor toilet & shower', 'Outside hot water wash area', 'Tea/coffee station', 'Mini fridge', 'Electricity & power points', 'Overhead fan', 'Braai facilities', 'Ample storage', 'Free Wi-Fi', 'Room service', 'Breakfast available'],
      images: [
        `${WIX}/57b862_e2d52c40c733456baeaccf87ddfd2352~mv2.jpg`,
      ],
    },
    {
      name: 'Super Deluxe Camp',
      description: 'Premium group camping in the dune forest beneath tall shade trees. Each camp comprises 3 en-suite safari tents sharing a private outdoor area — perfect for families and groups. All the good parts of camping, none of the bad.',
      max_occupancy: 6,
      base_rate: 1307,
      amenities: ['3 safari tents per camp', 'King bed per tent', 'Overhead fan per tent', 'Wardrobe & charging points', 'Coffee station', 'Mini fridge', 'Braai facilities', 'Outdoor seating area', 'Private outdoor shower & toilet', 'Free Wi-Fi', 'Room service', 'Breakfast available'],
      images: [
        `${WIX}/57b862_048ef096c8d246b1a98c229af8eab35e~mv2.jpg`,
      ],
    },
    {
      name: 'Sea View Tent',
      description: 'Luxury tented accommodation with uninterrupted ocean views from the ridge. Wake up to panoramic sea vistas from your king bed in this exclusive, secluded tent perched on the coastal hillside.',
      max_occupancy: 2,
      base_rate: 3441,
      amenities: ['King bed', 'Ocean-facing position', 'Private outdoor shower & toilet', 'Tea/coffee station', 'Mini fridge', 'Electricity & power points', 'Overhead fan', 'Braai facilities', 'Free Wi-Fi', 'Room service', 'Breakfast available'],
      images: [
        `${WIX}/57b862_7a8f19788c374f5481dd67454d601214~mv2.jpg`,
      ],
    },
  ];

  const insertRoomType = db.prepare(`
    INSERT INTO room_types (property_id, name, description, max_occupancy, base_rate, currency, amenities_json, image_urls_json)
    VALUES (1, ?, ?, ?, ?, 'ZAR', ?, ?)
  `);
  const findRoomType = db.prepare('SELECT id FROM room_types WHERE property_id = 1 AND name = ?');

  for (const rt of SKY_ROOM_TYPES) {
    if (!findRoomType.get(rt.name)) {
      insertRoomType.run(
        rt.name, rt.description, rt.max_occupancy, rt.base_rate,
        JSON.stringify(rt.amenities), JSON.stringify(rt.images)
      );
      console.log(`[seed] Room type added: ${rt.name}`);
    }
  }

  console.log('Database migrations complete');
}

module.exports = { runMigrations };
