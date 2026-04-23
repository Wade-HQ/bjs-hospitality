'use strict';
const { createNotification } = require('./notifications');

function updateCommissionStatuses(db) {
  const propertyId = parseInt(process.env.PROPERTY_ID, 10);
  const today = new Date().toISOString().slice(0, 10);

  try {
    // Mark pending commissions as 'due' if due_date has passed
    const nowDue = db.prepare(`
      UPDATE ota_commissions
      SET status = 'due', updated_at = CURRENT_TIMESTAMP
      WHERE hotel_property_id = ?
        AND status = 'pending'
        AND due_date IS NOT NULL
        AND due_date <= ?
    `).run(propertyId, today);

    // Mark due commissions as 'overdue' if they are more than 7 days past due
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const nowOverdue = db.prepare(`
      UPDATE ota_commissions
      SET status = 'overdue', updated_at = CURRENT_TIMESTAMP
      WHERE hotel_property_id = ?
        AND status = 'due'
        AND due_date IS NOT NULL
        AND due_date <= ?
    `).run(propertyId, sevenDaysAgo);

    // Create notifications for newly overdue commissions
    const overdueCommissions = db.prepare(`
      SELECT oc.id, oc.amount, oc.currency, oc.due_date, b.booking_ref
      FROM ota_commissions oc
      JOIN bookings b ON b.id = oc.booking_id
      WHERE oc.hotel_property_id = ?
        AND oc.status = 'overdue'
        AND oc.updated_at >= datetime('now', '-5 minutes')
    `).all(propertyId);

    for (const c of overdueCommissions) {
      createNotification(
        db,
        'commission_overdue',
        'Commission Overdue',
        `Commission of ${c.currency} ${c.amount.toFixed(2)} for booking ${c.booking_ref} is overdue (was due ${c.due_date})`,
        c.id,
        'ota_commissions'
      );
    }

    // Create notifications for commissions due today
    const dueToday = db.prepare(`
      SELECT oc.id, oc.amount, oc.currency, b.booking_ref
      FROM ota_commissions oc
      JOIN bookings b ON b.id = oc.booking_id
      WHERE oc.hotel_property_id = ?
        AND oc.status = 'due'
        AND oc.due_date = ?
    `).all(propertyId, today);

    for (const c of dueToday) {
      createNotification(
        db,
        'commission_due',
        'Commission Due Today',
        `Commission of ${c.currency} ${c.amount.toFixed(2)} for booking ${c.booking_ref} is due today`,
        c.id,
        'ota_commissions'
      );
    }

    if (nowDue.changes > 0 || nowOverdue.changes > 0) {
      console.log(`[commissions] Updated: ${nowDue.changes} now due, ${nowOverdue.changes} now overdue`);
    }
  } catch (err) {
    console.error('[commissions] updateCommissionStatuses error:', err.message);
  }
}

module.exports = { updateCommissionStatuses };
