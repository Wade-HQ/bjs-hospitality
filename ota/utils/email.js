'use strict';

const nodemailer = require('nodemailer');

let _transporter = null;

function getTransporter() {
  if (!process.env.SMTP_HOST) return null;
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }
  return _transporter;
}

const FROM_NAME  = process.env.FROM_NAME  || 'Sun Safari Destinations';
const FROM_EMAIL = process.env.FROM_EMAIL || 'bookings@sunsafaridestinations.co.za';
const FROM_ADDR  = `"${FROM_NAME}" <${FROM_EMAIL}>`;

async function send(to, subject, html) {
  const t = getTransporter();
  if (!t || !to) return;
  try {
    await t.sendMail({ from: FROM_ADDR, to, subject, html });
  } catch (err) {
    console.error('[email] send failed:', err.message);
  }
}

function fmt(n, currency) {
  return `${currency || ''} ${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
}

function row(label, value) {
  return `
    <tr>
      <td style="padding:8px 12px;color:#6b7280;font-size:14px;border-bottom:1px solid #f3f4f6;">${label}</td>
      <td style="padding:8px 12px;font-size:14px;font-weight:600;color:#111827;border-bottom:1px solid #f3f4f6;">${value}</td>
    </tr>`;
}

function baseLayout(propertyName, headline, body) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
      <!-- Header -->
      <tr><td style="background:#0D1B2A;padding:28px 32px;">
        <div style="color:#C8922A;font-size:22px;font-weight:700;letter-spacing:0.5px;">${propertyName}</div>
        <div style="color:rgba(255,255,255,0.6);font-size:13px;margin-top:4px;">Sun Safari Destinations</div>
      </td></tr>
      <!-- Headline -->
      <tr><td style="padding:28px 32px 8px;">
        <div style="font-size:20px;font-weight:700;color:#0D1B2A;">${headline}</div>
      </td></tr>
      <!-- Body -->
      <tr><td style="padding:8px 32px 32px;">${body}</td></tr>
      <!-- Footer -->
      <tr><td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
        <div style="font-size:12px;color:#9ca3af;text-align:center;">
          This email was sent by ${propertyName} via Sun Safari Destinations.<br>
          Please do not reply directly — contact us at <a href="mailto:${FROM_EMAIL}" style="color:#C8922A;">${FROM_EMAIL}</a>
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

// ── Guest booking confirmation ────────────────────────────────────────────────
async function sendBookingConfirmation(booking) {
  const {
    guest_email, first_name, last_name,
    booking_ref, property_name, room_type_name, room_number,
    check_in, check_out, nights, adults, children,
    total_amount, currency, payment_status, special_requests,
    payment_instructions, property_phone, property_email,
  } = booking;

  if (!guest_email) return;

  const payStatus = {
    unpaid:        'Outstanding — payment required',
    deposit_paid:  'Deposit received — balance due on arrival',
    fully_paid:    'Fully paid — thank you!',
  }[payment_status] || payment_status;

  const payBlock = payment_instructions
    ? `<div style="margin-top:20px;padding:16px;background:#fffbeb;border-left:4px solid #C8922A;border-radius:4px;">
        <div style="font-size:13px;font-weight:700;color:#92400e;margin-bottom:8px;">PAYMENT INSTRUCTIONS</div>
        <div style="font-size:13px;color:#78350f;white-space:pre-line;">${payment_instructions}</div>
      </div>`
    : '';

  const childrenRow = parseInt(children) > 0 ? row('Children', children) : '';
  const specialRow  = special_requests
    ? row('Special Requests', `<em>${special_requests}</em>`)
    : '';

  const body = `
    <p style="font-size:15px;color:#374151;margin:0 0 20px;">
      Dear ${first_name},<br><br>
      Your reservation at <strong>${property_name}</strong> has been received.
      Please find your booking details below.
    </p>
    <div style="background:#0D1B2A;color:#C8922A;text-align:center;padding:16px;border-radius:6px;margin-bottom:20px;">
      <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:0.7;">Booking Reference</div>
      <div style="font-size:28px;font-weight:700;letter-spacing:3px;">${booking_ref}</div>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-bottom:20px;">
      ${row('Property',    property_name)}
      ${row('Room',        room_type_name + (room_number ? ` (${room_number})` : ''))}
      ${row('Check-in',    check_in)}
      ${row('Check-out',   check_out)}
      ${row('Nights',      nights)}
      ${row('Guests',      adults + ' adult' + (adults != 1 ? 's' : ''))}
      ${childrenRow}
      ${row('Total Amount',fmt(total_amount, currency))}
      ${row('Payment',     payStatus)}
      ${specialRow}
    </table>
    ${payBlock}
    <p style="font-size:13px;color:#6b7280;margin-top:24px;">
      Need to change or cancel? Contact us:${property_email ? `<br>Email: <a href="mailto:${property_email}" style="color:#C8922A;">${property_email}</a>` : ''}
      ${property_phone ? `<br>Phone: ${property_phone}` : ''}
    </p>
    <p style="font-size:12px;color:#9ca3af;margin-top:16px;">
      We look forward to welcoming you. Please keep this email as your booking record.
    </p>`;

  await send(
    guest_email,
    `Booking Confirmed — ${booking_ref} | ${property_name}`,
    baseLayout(property_name, 'Booking Confirmation', body)
  );
}

// ── Property owner / staff new-booking alert ──────────────────────────────────
async function sendNewBookingAlert(booking) {
  const {
    property_email, property_name,
    booking_ref, first_name, last_name, guest_email, guest_phone,
    check_in, check_out, nights, adults,
    total_amount, currency, payment_status, room_type_name, source,
  } = booking;

  if (!property_email) return;

  const body = `
    <p style="font-size:15px;color:#374151;margin:0 0 20px;">
      A new booking has been made through the online booking portal.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-bottom:20px;">
      ${row('Booking Ref',  `<strong>${booking_ref}</strong>`)}
      ${row('Guest',        `${first_name} ${last_name}`)}
      ${row('Email',        `<a href="mailto:${guest_email}" style="color:#C8922A;">${guest_email}</a>`)}
      ${row('Phone',        guest_phone || '—')}
      ${row('Room Type',    room_type_name)}
      ${row('Check-in',     check_in)}
      ${row('Check-out',    check_out)}
      ${row('Nights',       nights)}
      ${row('Guests',       adults)}
      ${row('Total',        fmt(total_amount, currency))}
      ${row('Payment',      payment_status?.replace('_', ' '))}
      ${row('Source',       source || 'online')}
    </table>
    <p style="font-size:13px;color:#6b7280;">Log in to the PMS to manage this booking.</p>`;

  await send(
    property_email,
    `New Booking ${booking_ref} — ${first_name} ${last_name} | ${check_in}`,
    baseLayout(property_name, 'New Booking Received', body)
  );
}

// ── Guest cancellation notice ─────────────────────────────────────────────────
async function sendBookingCancellation(booking) {
  const {
    guest_email, first_name,
    booking_ref, property_name,
    check_in, check_out,
    property_email, property_phone,
    reason,
  } = booking;

  if (!guest_email) return;

  const body = `
    <p style="font-size:15px;color:#374151;margin:0 0 20px;">
      Dear ${first_name},<br><br>
      Your booking at <strong>${property_name}</strong> has been cancelled.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-bottom:20px;">
      ${row('Booking Ref', booking_ref)}
      ${row('Property',    property_name)}
      ${row('Check-in',    check_in)}
      ${row('Check-out',   check_out)}
      ${reason ? row('Reason', reason) : ''}
    </table>
    <p style="font-size:13px;color:#6b7280;">
      If you believe this is an error or would like to make a new booking, please contact us:
      ${property_email ? `<br>Email: <a href="mailto:${property_email}" style="color:#C8922A;">${property_email}</a>` : ''}
      ${property_phone ? `<br>Phone: ${property_phone}` : ''}
    </p>`;

  await send(
    guest_email,
    `Booking Cancelled — ${booking_ref} | ${property_name}`,
    baseLayout(property_name, 'Booking Cancellation', body)
  );
}

module.exports = { sendBookingConfirmation, sendNewBookingAlert, sendBookingCancellation };
