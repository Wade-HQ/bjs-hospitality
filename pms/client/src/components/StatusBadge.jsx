import React from 'react';

const STATUS_STYLES = {
  provisional:   'bg-amber-100 text-amber-800',
  confirmed:     'bg-blue-100 text-blue-800',
  checked_in:    'bg-green-100 text-green-800',
  checked_out:   'bg-gray-100 text-gray-700',
  cancelled:     'bg-red-100 text-red-800',
  no_show:       'bg-gray-100 text-gray-600',
  unpaid:        'bg-red-100 text-red-800',
  deposit_paid:  'bg-amber-100 text-amber-800',
  fully_paid:    'bg-green-100 text-green-800',
  pending:       'bg-amber-100 text-amber-800',
  due:           'bg-orange-100 text-orange-800',
  overdue:       'bg-red-100 text-red-800',
  paid:          'bg-green-100 text-green-800',
  blocked:       'bg-gray-100 text-gray-700',
  active:        'bg-green-100 text-green-800',
  inactive:      'bg-gray-100 text-gray-600',
};

const STATUS_LABELS = {
  provisional:  'Provisional',
  confirmed:    'Confirmed',
  checked_in:   'Checked In',
  checked_out:  'Checked Out',
  cancelled:    'Cancelled',
  no_show:      'No Show',
  unpaid:       'Unpaid',
  deposit_paid: 'Deposit Paid',
  fully_paid:   'Fully Paid',
  pending:      'Pending',
  due:          'Due',
  overdue:      'Overdue',
  paid:         'Paid',
  blocked:      'Blocked',
  active:       'Active',
  inactive:     'Inactive',
};

export default function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || 'bg-gray-100 text-gray-700';
  const label = STATUS_LABELS[status] || (status ? status.replace(/_/g, ' ') : '—');
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style}`}>
      {label}
    </span>
  );
}
