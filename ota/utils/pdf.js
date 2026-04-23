'use strict';
const htmlPdfNode = require('html-pdf-node');

async function generateInvoicePdf(invoice, property, booking, guest) {
  const lineItems = typeof invoice.line_items_json === 'string'
    ? JSON.parse(invoice.line_items_json || '[]')
    : (invoice.line_items_json || []);

  const currency = invoice.currency || property.currency || 'USD';
  const taxLabel = property.tax_label || 'VAT';

  const formatMoney = (n) => {
    const num = parseFloat(n) || 0;
    return currency + ' ' + num.toFixed(2);
  };

  const formatDate = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const lineItemRows = lineItems.map(item => `
    <tr>
      <td style="padding:8px 12px; border-bottom:1px solid #e0e0e0;">${item.description || ''}</td>
      <td style="padding:8px 12px; border-bottom:1px solid #e0e0e0; text-align:center;">${item.qty || 1}</td>
      <td style="padding:8px 12px; border-bottom:1px solid #e0e0e0; text-align:right;">${formatMoney(item.unit_price || 0)}</td>
      <td style="padding:8px 12px; border-bottom:1px solid #e0e0e0; text-align:right;">${formatMoney((item.qty || 1) * (item.unit_price || 0))}</td>
    </tr>
  `).join('');

  const discountRow = invoice.discount_amount && parseFloat(invoice.discount_amount) > 0 ? `
    <tr>
      <td colspan="3" style="padding:6px 12px; text-align:right; color:#666;">Discount</td>
      <td style="padding:6px 12px; text-align:right; color:#e53e3e;">- ${formatMoney(invoice.discount_amount)}</td>
    </tr>
  ` : '';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invoice ${invoice.invoice_number}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #222; background: #fff; }
    .header { background: #0D1B2A; color: #fff; padding: 30px 40px; display: flex; justify-content: space-between; align-items: flex-start; }
    .header .property-name { font-size: 22px; font-weight: bold; color: #C8922A; margin-bottom: 4px; }
    .header .property-sub { font-size: 12px; color: #ccc; }
    .header .invoice-heading { font-size: 32px; font-weight: bold; color: #C8922A; text-align: right; }
    .header .invoice-meta { font-size: 12px; color: #ccc; text-align: right; margin-top: 4px; }
    .body { padding: 30px 40px; }
    .meta-grid { display: flex; justify-content: space-between; margin-bottom: 30px; }
    .bill-to h4 { font-size: 11px; text-transform: uppercase; color: #888; margin-bottom: 6px; letter-spacing: 0.05em; }
    .bill-to p { font-size: 13px; color: #222; line-height: 1.6; }
    .invoice-details { text-align: right; }
    .invoice-details table { margin-left: auto; }
    .invoice-details td { padding: 3px 6px; font-size: 13px; }
    .invoice-details td:first-child { color: #666; }
    .invoice-details td:last-child { font-weight: 600; }
    table.items { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    table.items thead tr { background: #0D1B2A; color: #fff; }
    table.items thead th { padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600; }
    table.items thead th:not(:first-child) { text-align: center; }
    table.items thead th:last-child { text-align: right; }
    .totals { width: 280px; margin-left: auto; border: 1px solid #e0e0e0; border-radius: 4px; overflow: hidden; }
    .totals tr td { padding: 8px 14px; font-size: 13px; }
    .totals tr:not(:last-child) { border-bottom: 1px solid #e0e0e0; }
    .totals .grand-total td { background: #0D1B2A; color: #C8922A; font-size: 15px; font-weight: bold; }
    .payment-section { margin-top: 30px; padding: 16px; background: #f7f7f7; border-radius: 4px; border-left: 4px solid #C8922A; }
    .payment-section h4 { font-size: 12px; text-transform: uppercase; color: #888; margin-bottom: 8px; letter-spacing: 0.05em; }
    .payment-section p { font-size: 13px; color: #333; white-space: pre-wrap; line-height: 1.6; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e0e0e0; text-align: center; font-size: 11px; color: #999; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="property-name">${property.name}</div>
      <div class="property-sub">${property.address || ''}</div>
      ${property.vat_number ? `<div class="property-sub">VAT: ${property.vat_number}</div>` : ''}
    </div>
    <div>
      <div class="invoice-heading">INVOICE</div>
      <div class="invoice-meta">${invoice.invoice_number}</div>
    </div>
  </div>

  <div class="body">
    <div class="meta-grid">
      <div class="bill-to">
        <h4>Bill To</h4>
        <p>
          <strong>${invoice.recipient_name || (guest ? guest.first_name + ' ' + guest.last_name : '')}</strong><br>
          ${invoice.recipient_email || (guest ? guest.email || '' : '')}<br>
          ${invoice.recipient_address || (guest ? guest.address || '' : '')}
        </p>
      </div>
      <div class="invoice-details">
        <table>
          <tr><td>Invoice Date:</td><td>${formatDate(invoice.created_at)}</td></tr>
          ${invoice.due_date ? `<tr><td>Due Date:</td><td>${formatDate(invoice.due_date)}</td></tr>` : ''}
          ${booking ? `<tr><td>Booking Ref:</td><td>${booking.booking_ref}</td></tr>` : ''}
          ${booking ? `<tr><td>Check-in:</td><td>${formatDate(booking.check_in)}</td></tr>` : ''}
          ${booking ? `<tr><td>Check-out:</td><td>${formatDate(booking.check_out)}</td></tr>` : ''}
          <tr><td>Status:</td><td style="text-transform:capitalize;">${invoice.status}</td></tr>
        </table>
      </div>
    </div>

    <table class="items">
      <thead>
        <tr>
          <th>Description</th>
          <th style="text-align:center;">Qty</th>
          <th style="text-align:right;">Unit Price</th>
          <th style="text-align:right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${lineItemRows || '<tr><td colspan="4" style="padding:12px; color:#999; text-align:center;">No line items</td></tr>'}
      </tbody>
    </table>

    <table class="totals">
      <tr>
        <td>Subtotal</td>
        <td style="text-align:right;">${formatMoney(invoice.subtotal)}</td>
      </tr>
      <tr>
        <td>${taxLabel} (${property.tax_rate || 0}%)</td>
        <td style="text-align:right;">${formatMoney(invoice.tax_amount)}</td>
      </tr>
      ${discountRow}
      <tr class="grand-total">
        <td>TOTAL</td>
        <td style="text-align:right;">${formatMoney(invoice.total_amount)}</td>
      </tr>
    </table>

    ${property.payment_instructions ? `
    <div class="payment-section">
      <h4>Payment Instructions</h4>
      <p>${property.payment_instructions}</p>
    </div>
    ` : ''}

    <div class="footer">
      ${property.name} &bull;
      ${property.contact_email || ''} &bull;
      ${property.contact_phone || ''}
      ${property.vat_number ? '&bull; VAT: ' + property.vat_number : ''}
    </div>
  </div>
</body>
</html>`;

  const file = { content: html };
  const options = {
    format: 'A4',
    margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
  };

  const pdfBuffer = await htmlPdfNode.generatePdf(file, options);
  return pdfBuffer;
}

module.exports = { generateInvoicePdf };
