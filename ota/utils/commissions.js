'use strict';
const { createNotification } = require('./notifications');

function updateCommissionStatuses(db) {
  try {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    // Calculate overdue threshold (due_date + 7 days < today)
    const overdueCutoff = new Date(today);
    overdueCutoff.setDate(overdueCutoff.getDate() - 7);
    const overdueCutoffStr = overdueCutoff.toISOString().slice(0, 10);

    const commissions = db.prepare(`
      SELECT c.*, b.booking_ref
      FROM ota_commissions c
      LEFT JOIN bookings b ON b.id = c.booking_id
      WHERE c.status != 'paid'
    `).all();

    for (const c of commissions) {
      if (!c.due_date) continue;

      const dueDate = c.due_date.slice(0, 10);

      if (c.status === 'due' && dueDate <= overdueCutoffStr) {
        // Transition due -> overdue
        db.prepare(`
          UPDATE ota_commissions SET status = 'overdue', updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(c.id);

        createNotification(
          db,
          c.hotel_property_id,
          'commission_overdue',
          'Commission Overdue',
          `Commission for booking ${c.booking_ref || c.booking_id} is overdue. Amount: ${c.currency} ${c.amount.toFixed(2)}`,
          c.id,
          'commission'
        );
      } else if (c.status === 'pending' && dueDate <= todayStr) {
        // Transition pending -> due
        db.prepare(`
          UPDATE ota_commissions SET status = 'due', updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(c.id);

        createNotification(
          db,
          c.hotel_property_id,
          'commission_due',
          'Commission Due',
          `Commission for booking ${c.booking_ref || c.booking_id} is now due. Amount: ${c.currency} ${c.amount.toFixed(2)}`,
          c.id,
          'commission'
        );
      }
    }
  } catch (err) {
    console.error('updateCommissionStatuses error:', err.message);
  }
}

module.exports = { updateCommissionStatuses };
