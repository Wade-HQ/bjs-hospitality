'use strict';

function createNotification(db, type, title, message, relatedId, relatedType) {
  const propertyId = parseInt(process.env.PROPERTY_ID, 10);
  try {
    db.prepare(`
      INSERT INTO notifications (property_id, type, title, message, related_id, related_type)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(propertyId, type, title, message || null, relatedId || null, relatedType || null);
  } catch (err) {
    console.error('Failed to create notification:', err.message);
  }
}

module.exports = { createNotification };
