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

    CREATE TABLE IF NOT EXISTS room_type_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_type_id INTEGER NOT NULL REFERENCES room_types(id) ON DELETE CASCADE,
      region TEXT NOT NULL CHECK(region IN ('international', 'sadc')),
      rate_per_person REAL NOT NULL DEFAULT 0,
      single_supplement_multiplier REAL NOT NULL DEFAULT 1.5,
      children_pct REAL NOT NULL DEFAULT 50,
      is_online INTEGER NOT NULL DEFAULT 1,
      is_sto INTEGER NOT NULL DEFAULT 1,
      is_agent INTEGER NOT NULL DEFAULT 1,
      is_ota INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(room_type_id, region)
    );

    CREATE TABLE IF NOT EXISTS meal_packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      price_per_person REAL NOT NULL DEFAULT 0,
      is_online INTEGER NOT NULL DEFAULT 1,
      is_sto INTEGER NOT NULL DEFAULT 1,
      is_agent INTEGER NOT NULL DEFAULT 1,
      is_ota INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS seasonal_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      pct_change REAL NOT NULL DEFAULT 0,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_seasonal_adjustments_property_dates
      ON seasonal_adjustments(property_id, start_date, end_date);

    CREATE INDEX IF NOT EXISTS idx_meal_packages_property
      ON meal_packages(property_id);
  `);

  // ── Column migrations (idempotent — SQLite throws if column already exists) ──
  const roomMigrations = [
    `ALTER TABLE rooms ADD COLUMN name TEXT`,
    `ALTER TABLE rooms ADD COLUMN max_occupancy INTEGER DEFAULT 2`,
    `ALTER TABLE rooms ADD COLUMN max_adults INTEGER`,
    `ALTER TABLE rooms ADD COLUMN bed_config TEXT`,
    `ALTER TABLE rooms ADD COLUMN bed_config_alt TEXT`,
    `ALTER TABLE rooms ADD COLUMN show_online INTEGER DEFAULT 1`,
    `ALTER TABLE rooms ADD COLUMN description TEXT`,
    `ALTER TABLE rooms ADD COLUMN amenities_json TEXT DEFAULT '[]'`,
    `ALTER TABLE rooms ADD COLUMN wheelchair_accessible INTEGER DEFAULT 0`,
    `ALTER TABLE rooms ADD COLUMN bedrooms INTEGER DEFAULT 1`,
  ];
  for (const sql of roomMigrations) {
    try { db.exec(sql); } catch (_) { /* column already exists */ }
  }

  const bookingRateMigrations = [
    `ALTER TABLE bookings ADD COLUMN region TEXT CHECK(region IN ('international', 'sadc'))`,
    `ALTER TABLE bookings ADD COLUMN meal_package_id INTEGER REFERENCES meal_packages(id)`,
    `ALTER TABLE bookings ADD COLUMN meal_total REAL NOT NULL DEFAULT 0`,
  ];
  for (const sql of bookingRateMigrations) {
    try { db.exec(sql); } catch (_) { /* column already exists */ }
  }

  // Seed room_type_rates from existing room_types for any room type that doesn't have rates yet
  const roomTypesWithoutRates = db.prepare(`
    SELECT id, base_rate FROM room_types
    WHERE id NOT IN (SELECT DISTINCT room_type_id FROM room_type_rates)
  `).all();
  if (roomTypesWithoutRates.length > 0) {
    const insertRate = db.prepare(`
      INSERT OR IGNORE INTO room_type_rates (room_type_id, region, rate_per_person)
      VALUES (?, ?, ?)
    `);
    for (const rt of roomTypesWithoutRates) {
      insertRate.run(rt.id, 'international', rt.base_rate || 0);
      insertRate.run(rt.id, 'sadc', rt.base_rate || 0);
    }
    console.log(`[seed] Seeded room_type_rates for ${roomTypesWithoutRates.length} room types`);
  }

  // One-time seed flag — prevents re-inserting default room types after they've been deleted
  try { db.exec(`ALTER TABLE properties ADD COLUMN room_types_seeded INTEGER DEFAULT 0`); } catch (_) {}
  // Mark existing properties as already seeded (the column was just added with DEFAULT 0,
  // but any property that already has room types doesn't need seeding again)
  db.exec(`
    UPDATE properties SET room_types_seeded=1
    WHERE id IN (SELECT DISTINCT property_id FROM room_types)
    AND room_types_seeded=0
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

  // ── Default room types — seeded ONCE on first boot only ──────────────────────
  // room_types_seeded flag is set after first seed; deleting a room type will NOT
  // bring it back on restart. Re-run seed by setting room_types_seeded=0 in DB.
  const skySeeded = db.prepare('SELECT room_types_seeded FROM properties WHERE id=1').get();
  const memSeeded = db.prepare('SELECT room_types_seeded FROM properties WHERE id=2').get();
  const needsSkyS = skySeeded && skySeeded.room_types_seeded === 0;
  const needsMemS = memSeeded && memSeeded.room_types_seeded === 0;

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

  if (needsSkyS) {
    const insertRoomType = db.prepare(`
      INSERT INTO room_types (property_id, name, description, max_occupancy, base_rate, currency, amenities_json, image_urls_json)
      VALUES (1, ?, ?, ?, ?, 'ZAR', ?, ?)
    `);
    for (const rt of SKY_ROOM_TYPES) {
      insertRoomType.run(
        rt.name, rt.description, rt.max_occupancy, rt.base_rate,
        JSON.stringify(rt.amenities), JSON.stringify(rt.images)
      );
      console.log(`[seed] Room type added: ${rt.name}`);
      const rtId = db.prepare('SELECT id FROM room_types WHERE property_id=1 AND name=? ORDER BY id DESC LIMIT 1').get(rt.name)?.id;
      if (rtId) {
        db.prepare('INSERT OR IGNORE INTO room_type_rates (room_type_id, region, rate_per_person) VALUES (?, ?, ?)').run(rtId, 'international', rt.base_rate || 0);
        db.prepare('INSERT OR IGNORE INTO room_type_rates (room_type_id, region, rate_per_person) VALUES (?, ?, ?)').run(rtId, 'sadc', rt.base_rate || 0);
      }
    }
    db.prepare('UPDATE properties SET room_types_seeded=1 WHERE id=1').run();
    console.log('[seed] Sky Island room types seeded — will not re-seed on restart');
  }

  // ── Membene room types (seeded ONCE on first boot only, property 2) ────────
  const MEM_ROOM_TYPES = [
    {
      name: 'Dune Chalet — 1 Bedroom',
      description: 'Perched on the lower coastal dunes with panoramic ocean views and cool easterly sea breezes. This open-concept chalet is fully self-catering, with an indoor-outdoor design that frames forest sunsets to the west and ocean sunrises to the east.',
      max_occupancy: 3,
      base_rate: 3768,
      amenities: ['King bed', 'Sofa bed in living area', 'Fully-equipped kitchen', 'Open-plan dining & living area', 'En-suite bathroom', 'Indoor & outdoor shower', 'Stainless steel braai & fire pit', 'Private patio', 'Overhead fan', 'Daily cleaning service'],
      images: [`${WIX}/57b862_ab3af254502f434284229c48c104334d~mv2.jpg`, `${WIX}/57b862_ee58137cbd3642e5affb7a0d47594604~mv2.jpg`],
    },
    {
      name: 'Dune Chalet — 2 Bedroom',
      description: 'The spacious two-bedroom dune chalet sits on the lower coastal dune with uninterrupted ocean views. Designed for families and groups, it offers two private bedrooms, a fully-equipped kitchen, and an outdoor braai area steps from the beach.',
      max_occupancy: 7,
      base_rate: 3768,
      amenities: ['King bed (bedroom 1)', '2 single beds (bedroom 2)', 'Sofa bed + bunk bed option', 'Fully-equipped kitchen', 'Open-plan dining & living area', 'Shared bathroom with indoor & outdoor shower', 'Stainless steel braai & fire pit', 'Private patio', 'Overhead fan', 'Daily cleaning service'],
      images: [`${WIX}/57b862_07a5fce1b6124bea8b92935b67e6c436~mv2.jpg`, `${WIX}/57b862_94612a04802a42bfa48b60c069c5e9d5~mv2.jpeg`],
    },
    {
      name: 'Forest Chalet — 1 Bedroom',
      description: 'Tucked into lush coastal woodland at the edge of a pristine wetland, this chalet offers an intimate connection to nature with exceptional game viewing from your own patio. Wake to the sounds of birds and wildlife while staying in complete comfort.',
      max_occupancy: 4,
      base_rate: 3768,
      amenities: ['King bed', 'Single bed', 'Sofa bed in living area', 'Fully-equipped kitchen', 'Open-plan living & dining area', 'Private bathroom with indoor & outdoor shower', 'Outdoor braai & fire pit', 'Nature-facing patio', 'Overhead fan', 'Daily cleaning service'],
      images: [`${WIX}/57b862_8009a975b757476e849022bc5bd92414~mv2.jpg`, `${WIX}/57b862_30b743d967b4411bbb8f55def9322746~mv2.jpg`],
    },
    {
      name: 'Forest Chalet — 2 Bedroom',
      description: 'The two-bedroom forest chalet nestles in the coastal woodland on the wetland\'s edge — ideal for families seeking seclusion and wildlife encounters. The same immersive nature setting as the one-bedroom, with space for up to six guests.',
      max_occupancy: 6,
      base_rate: 3768,
      amenities: ['King bed (bedroom 1)', '2 single beds (bedroom 2)', 'Sofa bed in living area', 'Fully-equipped kitchen', 'Open-plan living & dining area', 'Private bathroom with indoor & outdoor shower', 'Outdoor braai & fire pit', 'Nature-facing patio', 'Overhead fan', 'Daily cleaning service'],
      images: [`${WIX}/57b862_6a4db97d6d554535ad4a94515dc663fc~mv2.jpg`, `${WIX}/57b862_52ff6c9f515e46d7a99ec1f7a64c84c8~mv2.jpg`],
    },
    {
      name: 'Hilltop Chalet',
      description: 'Perched on an elevated ridge with sweeping panoramic views over the forest canopy and Indian Ocean horizon. The Hilltop Chalet is designed for couples and digital nomads seeking seclusion and tranquillity — no braai, no crowds, just the sound of waves, birds, and monkeys.',
      max_occupancy: 3,
      base_rate: 3900,
      amenities: ['King bed', 'Open-plan living & dining area', 'Kitchenette with bar fridge & microwave', 'Private bathroom with indoor & outdoor shower', 'Panoramic forest & ocean views', 'Private patio', 'Overhead fan', 'Daily cleaning service'],
      images: [`${WIX}/57b862_75e09a3361874cf4ab72081110edc881~mv2.jpg`, `${WIX}/57b862_a5fd72bf9f8645e8bcc21fad9d6e875f~mv2.jpg`],
    },
    {
      name: 'Beachside Campsite',
      description: 'Beachfront campsites situated just behind the dunes, each with a private braai, hot showers, power, and USB charging. Self-contained and designed for overlanders — caravan-friendly sites available. Group camp (Camp 8) includes a shared kitchen, boma, and communal dining area.',
      max_occupancy: 10,
      base_rate: 0,
      amenities: ['Private braai & fire pit', 'Hot water showers (daily cleaned)', 'Power outlet (6A per site)', 'USB charging points', 'Scullery & dishwashing area', 'Laundry service', 'Electricity 18–22 hours', 'Trailer tent & caravan-friendly (select sites)', 'Group camp option with shared kitchen & boma'],
      images: [`${WIX}/57b862_722643ae249744bbb4ff631325fedc5f~mv2.jpg`, `${WIX}/57b862_1bf1fe4c560940d6881842c4c480e762~mv2.jpg`],
    },
  ];

  if (needsMemS) {
    const insertMemRoomType = db.prepare(`
      INSERT INTO room_types (property_id, name, description, max_occupancy, base_rate, currency, amenities_json, image_urls_json)
      VALUES (2, ?, ?, ?, ?, 'ZAR', ?, ?)
    `);
    for (const rt of MEM_ROOM_TYPES) {
      insertMemRoomType.run(
        rt.name, rt.description, rt.max_occupancy, rt.base_rate,
        JSON.stringify(rt.amenities), JSON.stringify(rt.images)
      );
      console.log(`[seed] Membene room type added: ${rt.name}`);
      const rtId = db.prepare('SELECT id FROM room_types WHERE property_id=2 AND name=? ORDER BY id DESC LIMIT 1').get(rt.name)?.id;
      if (rtId) {
        db.prepare('INSERT OR IGNORE INTO room_type_rates (room_type_id, region, rate_per_person) VALUES (?, ?, ?)').run(rtId, 'international', rt.base_rate || 0);
        db.prepare('INSERT OR IGNORE INTO room_type_rates (room_type_id, region, rate_per_person) VALUES (?, ?, ?)').run(rtId, 'sadc', rt.base_rate || 0);
      }
    }
    db.prepare('UPDATE properties SET room_types_seeded=1 WHERE id=2').run();
    console.log('[seed] Membene room types seeded — will not re-seed on restart');
  }

  // Update Membene property details
  db.prepare(`UPDATE properties SET
    name='Ponta Membene Lodge', contact_email='office@membene.co.mz',
    contact_phone='+258870162730'
    WHERE id=2`).run();

  console.log('Database migrations complete');
}

module.exports = { runMigrations };
