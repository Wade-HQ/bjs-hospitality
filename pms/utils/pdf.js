'use strict';
const htmlPdf = require('html-pdf-node');

function formatCurrency(amount, currency) {
  const num = Number(amount) || 0;
  return `${currency} ${num.toFixed(2)}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00Z' : ''));
  return d.toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

function generateInvoicePdf(invoice, property, booking, guest) {
  const lineItems = (() => {
    try { return JSON.parse(invoice.line_items_json || '[]'); } catch { return []; }
  })();

  const lineItemsHtml = lineItems.map(item => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee;">${item.description || ''}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${item.quantity || 1}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${formatCurrency(item.unit_price, invoice.currency)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${formatCurrency((item.quantity || 1) * (item.unit_price || 0), invoice.currency)}</td>
    </tr>
  `).join('');

  const recipientBlock = invoice.recipient_name
    ? `<div><strong>${invoice.recipient_name}</strong></div>
       ${invoice.recipient_email ? `<div>${invoice.recipient_email}</div>` : ''}
       ${invoice.recipient_address ? `<div>${invoice.recipient_address}</div>` : ''}`
    : (guest
        ? `<div><strong>${guest.first_name} ${guest.last_name}</strong></div>
           ${guest.email ? `<div>${guest.email}</div>` : ''}
           ${guest.phone ? `<div>${guest.phone}</div>` : ''}`
        : '<div>N/A</div>');

  const bookingBlock = booking ? `
    <table style="width:100%;font-size:13px;margin-bottom:20px;">
      <tr>
        <td><strong>Booking Ref:</strong> ${booking.booking_ref}</td>
        <td><strong>Check-in:</strong> ${formatDate(booking.check_in)}</td>
        <td><strong>Check-out:</strong> ${formatDate(booking.check_out)}</td>
        <td><strong>Nights:</strong> ${booking.nights}</td>
      </tr>
    </table>
  ` : '';

  const taxLabel = property.tax_label || 'VAT';
  const taxRate = property.tax_rate || 0;
  const subtotal = Number(invoice.subtotal) || 0;
  const taxAmount = Number(invoice.tax_amount) || 0;
  const total = Number(invoice.total_amount) || 0;

  const logoBlock = property.logo_url
    ? `<img src="${property.logo_url}" alt="${property.name}" style="max-height:60px;max-width:220px;object-fit:contain;display:block;margin-bottom:6px;" />`
    : `<div class="property-name">${property.name}</div>`;

  const bankBlock = (property.bank_name || property.bank_account) ? `
    <div class="bank-section">
      <h4>Banking Details</h4>
      ${property.bank_name ? `<div><strong>${property.bank_name}</strong></div>` : ''}
      ${property.bank_account ? `<div>Account: ${property.bank_account}</div>` : ''}
      ${property.bank_branch ? `<div>Branch: ${property.bank_branch}</div>` : ''}
      ${property.swift_code ? `<div>SWIFT: ${property.swift_code}</div>` : ''}
    </div>` : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #333; padding: 40px; font-size: 14px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; }
    .property-name { font-size: 22px; font-weight: bold; color: #1B4332; }
    .property-details { font-size: 12px; color: #666; margin-top: 4px; }
    .invoice-title { font-size: 28px; font-weight: bold; color: #1B4332; text-align: right; }
    .invoice-meta { text-align: right; font-size: 13px; color: #555; margin-top: 6px; }
    .status-badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: bold;
      text-transform: uppercase;
      margin-top: 4px;
    }
    .status-paid { background: #d1fae5; color: #065f46; }
    .status-draft { background: #fef3c7; color: #92400e; }
    .status-sent { background: #dbeafe; color: #1e40af; }
    .status-overdue { background: #fee2e2; color: #991b1b; }
    .status-cancelled { background: #f3f4f6; color: #6b7280; }
    .bill-section { display: flex; justify-content: space-between; margin-bottom: 30px; }
    .bill-box { font-size: 13px; }
    .bill-box h4 { font-size: 12px; text-transform: uppercase; color: #888; margin-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    thead th { background: #1B4332; color: #fff; padding: 10px 8px; text-align: left; font-size: 13px; }
    thead th:last-child, thead th:nth-child(3), thead th:nth-child(2) { text-align: right; }
    thead th:nth-child(2) { text-align: center; }
    .totals { margin-left: auto; width: 300px; }
    .totals table { margin-bottom: 0; }
    .totals td { padding: 6px 8px; font-size: 13px; }
    .totals .total-row td { font-weight: bold; font-size: 15px; border-top: 2px solid #1B4332; color: #1B4332; }
    .notes { margin-top: 30px; padding: 16px; background: #f9fafb; border-radius: 6px; font-size: 13px; }
    .notes h4 { font-weight: bold; margin-bottom: 6px; }
    .bank-section { margin-top: 20px; padding: 14px 16px; background: #f0fdf4; border-left: 3px solid #1B4332; border-radius: 4px; font-size: 13px; }
    .bank-section h4 { font-size: 12px; text-transform: uppercase; color: #1B4332; margin-bottom: 6px; font-weight: bold; }
    .bank-section div { margin-bottom: 2px; }
    .footer { margin-top: 40px; font-size: 11px; color: #aaa; text-align: center; border-top: 1px solid #eee; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      ${logoBlock}
      <div class="property-details">
        ${property.address ? property.address + '<br>' : ''}
        ${property.contact_email ? property.contact_email + '  ' : ''}
        ${property.contact_phone ? property.contact_phone : ''}
        ${property.vat_number ? '<br>VAT/Tax No: ' + property.vat_number : ''}
        ${property.company_reg ? '<br>Reg No: ' + property.company_reg : ''}
      </div>
    </div>
    <div>
      <div class="invoice-title">INVOICE</div>
      <div class="invoice-meta">
        <div><strong>#${invoice.invoice_number}</strong></div>
        <div>Issued: ${formatDate(invoice.created_at)}</div>
        ${invoice.due_date ? `<div>Due: ${formatDate(invoice.due_date)}</div>` : ''}
        <div><span class="status-badge status-${invoice.status}">${invoice.status}</span></div>
      </div>
    </div>
  </div>

  <div class="bill-section">
    <div class="bill-box">
      <h4>Bill To</h4>
      ${recipientBlock}
    </div>
    <div class="bill-box" style="text-align:right;">
      <h4>Property</h4>
      <div>${property.name}</div>
      ${property.domain ? `<div>${property.domain}</div>` : ''}
    </div>
  </div>

  ${bookingBlock}

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th style="text-align:center;width:80px;">Qty</th>
        <th style="text-align:right;width:130px;">Unit Price</th>
        <th style="text-align:right;width:130px;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${lineItemsHtml || `<tr><td colspan="4" style="padding:20px;text-align:center;color:#888;">No line items</td></tr>`}
    </tbody>
  </table>

  <div class="totals">
    <table>
      <tr>
        <td>Subtotal</td>
        <td style="text-align:right;">${formatCurrency(subtotal, invoice.currency)}</td>
      </tr>
      ${taxAmount > 0 ? `
      <tr>
        <td>${taxLabel} (${taxRate}%)</td>
        <td style="text-align:right;">${formatCurrency(taxAmount, invoice.currency)}</td>
      </tr>` : ''}
      <tr class="total-row">
        <td>TOTAL</td>
        <td style="text-align:right;">${formatCurrency(total, invoice.currency)}</td>
      </tr>
      ${invoice.paid_date ? `
      <tr>
        <td style="color:#065f46;">Paid on</td>
        <td style="text-align:right;color:#065f46;">${formatDate(invoice.paid_date)}</td>
      </tr>` : ''}
    </table>
  </div>

  ${invoice.notes || property.payment_instructions ? `
  <div class="notes">
    ${invoice.notes ? `<h4>Notes</h4><p>${invoice.notes}</p>` : ''}
    ${property.payment_instructions ? `<h4 style="margin-top:${invoice.notes ? '12px' : '0'};">Payment Instructions</h4><p>${property.payment_instructions}</p>` : ''}
  </div>` : ''}

  ${bankBlock}

  <div class="footer">
    ${property.invoice_footer || (property.name + (property.domain ? ' &mdash; ' + property.domain : '') + '<br>Thank you for your business.')}
  </div>
</body>
</html>`;

  return new Promise((resolve, reject) => {
    const file = { content: html };
    const options = {
      format: 'A4',
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
      printBackground: true
    };
    htmlPdf.generatePdf(file, options)
      .then(pdfBuffer => resolve(pdfBuffer))
      .catch(err => reject(err));
  });
}

function generateQuotationPdf(quote, property) {
  const currency = quote.currency || property.currency || 'ZAR';
  const taxLabel = property.tax_label || 'VAT';
  const taxRate  = property.tax_rate || 0;
  const validDays = property.quote_validity_days || 14;

  const today = new Date();
  const expiryDate = new Date(today);
  expiryDate.setDate(expiryDate.getDate() + validDays);

  const logoBlock = property.logo_url
    ? `<img src="${property.logo_url}" alt="${property.name}" style="max-height:60px;max-width:220px;object-fit:contain;display:block;margin-bottom:6px;" />`
    : `<div class="property-name">${property.name}</div>`;

  const bankBlock = (property.bank_name || property.bank_account) ? `
    <div class="bank-section">
      <h4>Banking Details (if you choose to proceed)</h4>
      ${property.bank_name ? `<div><strong>${property.bank_name}</strong></div>` : ''}
      ${property.bank_account ? `<div>Account: ${property.bank_account}</div>` : ''}
      ${property.bank_branch ? `<div>Branch: ${property.bank_branch}</div>` : ''}
      ${property.swift_code ? `<div>SWIFT: ${property.swift_code}</div>` : ''}
    </div>` : '';

  const guestBlock = (quote.guest_name || quote.guest_email)
    ? `<div><strong>${quote.guest_name || ''}</strong></div>
       ${quote.guest_email ? `<div>${quote.guest_email}</div>` : ''}
       ${quote.guest_phone ? `<div>${quote.guest_phone}</div>` : ''}`
    : '<div><em>No guest specified</em></div>';

  const priceRows = [];
  priceRows.push(`<tr><td style="padding:8px;border-bottom:1px solid #eee;">Accommodation — ${quote.room_type_name || ''} (${quote.rate_plan_name || ''})</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${quote.nights} night${quote.nights !== 1 ? 's' : ''}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${formatCurrency(quote.total_per_night, currency)}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${formatCurrency(quote.total_for_stay, currency)}</td></tr>`);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #333; padding: 40px; font-size: 14px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; }
    .property-name { font-size: 22px; font-weight: bold; color: #1B4332; }
    .property-details { font-size: 12px; color: #666; margin-top: 4px; }
    .doc-title { font-size: 28px; font-weight: bold; color: #C8922A; text-align: right; }
    .doc-meta { text-align: right; font-size: 13px; color: #555; margin-top: 6px; }
    .validity-badge { display:inline-block; background:#fef3c7; color:#92400e; padding:2px 10px; border-radius:12px; font-size:12px; font-weight:bold; margin-top:4px; }
    .bill-section { display: flex; justify-content: space-between; margin-bottom: 30px; }
    .bill-box { font-size: 13px; }
    .bill-box h4 { font-size: 12px; text-transform: uppercase; color: #888; margin-bottom: 6px; }
    .stay-summary { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius:6px; padding:14px 16px; margin-bottom:20px; font-size:13px; }
    .stay-summary table { width:100%; margin:0; }
    .stay-summary td { padding:3px 6px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    thead th { background: #1B4332; color: #fff; padding: 10px 8px; text-align: left; font-size: 13px; }
    thead th:last-child, thead th:nth-child(3), thead th:nth-child(2) { text-align: right; }
    thead th:nth-child(2) { text-align: center; }
    .totals { margin-left: auto; width: 300px; }
    .totals table { margin-bottom: 0; }
    .totals td { padding: 6px 8px; font-size: 13px; }
    .totals .total-row td { font-weight: bold; font-size: 15px; border-top: 2px solid #1B4332; color: #1B4332; }
    .breakdown { margin-top:20px; padding:14px 16px; background:#f9fafb; border-radius:6px; font-size:12px; color:#666; }
    .breakdown h4 { font-size:11px; text-transform:uppercase; color:#888; margin-bottom:6px; }
    .bank-section { margin-top: 20px; padding: 14px 16px; background: #f0fdf4; border-left: 3px solid #1B4332; border-radius: 4px; font-size: 13px; }
    .bank-section h4 { font-size: 12px; text-transform: uppercase; color: #1B4332; margin-bottom: 6px; font-weight: bold; }
    .bank-section div { margin-bottom: 2px; }
    .footer { margin-top: 40px; font-size: 11px; color: #aaa; text-align: center; border-top: 1px solid #eee; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      ${logoBlock}
      <div class="property-details">
        ${property.address ? property.address + '<br>' : ''}
        ${property.contact_email ? property.contact_email + '  ' : ''}
        ${property.contact_phone ? property.contact_phone : ''}
        ${property.vat_number ? '<br>VAT/Tax No: ' + property.vat_number : ''}
        ${property.company_reg ? '<br>Reg No: ' + property.company_reg : ''}
      </div>
    </div>
    <div>
      <div class="doc-title">QUOTATION</div>
      <div class="doc-meta">
        <div>Date: ${formatDate(today.toISOString().split('T')[0])}</div>
        <div><span class="validity-badge">Valid until ${formatDate(expiryDate.toISOString().split('T')[0])}</span></div>
      </div>
    </div>
  </div>

  <div class="bill-section">
    <div class="bill-box">
      <h4>Prepared For</h4>
      ${guestBlock}
    </div>
    <div class="bill-box" style="text-align:right;">
      <h4>Prepared By</h4>
      <div>${property.name}</div>
      ${property.domain ? `<div>${property.domain}</div>` : ''}
    </div>
  </div>

  <div class="stay-summary">
    <table>
      <tr>
        <td><strong>Check-in:</strong> ${formatDate(quote.check_in)}</td>
        <td><strong>Check-out:</strong> ${formatDate(quote.check_out)}</td>
        <td><strong>Nights:</strong> ${quote.nights}</td>
        <td><strong>Adults:</strong> ${quote.adults}${quote.children > 0 ? ' &nbsp; <strong>Children:</strong> ' + quote.children : ''}</td>
      </tr>
      <tr>
        <td><strong>Accommodation:</strong> ${quote.room_type_name || ''}</td>
        <td colspan="2"><strong>Rate Plan:</strong> ${quote.rate_plan_name || ''}</td>
        <td><strong>Region:</strong> ${quote.region === 'international' ? 'International' : 'SADC'}</td>
      </tr>
    </table>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th style="text-align:center;width:80px;">Nights</th>
        <th style="text-align:right;width:130px;">Per Night</th>
        <th style="text-align:right;width:130px;">Total</th>
      </tr>
    </thead>
    <tbody>
      ${priceRows.join('')}
    </tbody>
  </table>

  <div class="totals">
    <table>
      <tr>
        <td>Accommodation</td>
        <td style="text-align:right;">${formatCurrency(quote.total_for_stay, currency)}</td>
      </tr>
      ${quote.tax_amount > 0 ? `
      <tr>
        <td>${taxLabel} (${taxRate}%)</td>
        <td style="text-align:right;">${formatCurrency(quote.tax_amount, currency)}</td>
      </tr>` : ''}
      <tr class="total-row">
        <td>TOTAL</td>
        <td style="text-align:right;">${formatCurrency(quote.total_amount, currency)}</td>
      </tr>
    </table>
  </div>

  ${quote.season_name ? `
  <div class="breakdown">
    <h4>Rate Notes</h4>
    <div>* ${quote.season_name} pricing applied</div>
    ${quote.channel_name ? `<div>* ${quote.channel_name} channel rates</div>` : ''}
    ${quote.special_requests ? `<div>Special requests: ${quote.special_requests}</div>` : ''}
  </div>` : quote.special_requests ? `
  <div class="breakdown">
    <h4>Notes</h4>
    <div>${quote.special_requests}</div>
  </div>` : ''}

  ${property.payment_instructions ? `
  <div class="breakdown" style="background:#f0fdf4;border-left:3px solid #1B4332;">
    <h4>Payment Instructions</h4>
    <div>${property.payment_instructions}</div>
  </div>` : ''}

  ${bankBlock}

  <div class="footer">
    ${property.invoice_footer || ('This quotation is valid for ' + validDays + ' days from the date of issue. Prices are subject to availability at time of booking.<br>' + property.name + (property.domain ? ' &mdash; ' + property.domain : ''))}
  </div>
</body>
</html>`;

  return new Promise((resolve, reject) => {
    const file = { content: html };
    const options = {
      format: 'A4',
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
      printBackground: true
    };
    htmlPdf.generatePdf(file, options)
      .then(pdfBuffer => resolve(pdfBuffer))
      .catch(err => reject(err));
  });
}

module.exports = { generateInvoicePdf, generateQuotationPdf };
