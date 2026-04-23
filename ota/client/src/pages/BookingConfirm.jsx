import React, { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import Modal from '../components/Modal.jsx';

export default function BookingConfirm() {
  const [searchParams] = useSearchParams();
  const ref = searchParams.get('ref') || 'N/A';
  const [showBankModal, setShowBankModal] = useState(false);
  const [paymentType, setPaymentType] = useState('');

  const openPayment = (type) => {
    setPaymentType(type);
    setShowBankModal(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Green top banner */}
          <div className="bg-green-500 px-6 py-8 text-center">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
              <span className="text-green-500 text-3xl font-bold">✓</span>
            </div>
            <h1 className="text-white text-2xl font-bold mb-1">Booking Request Received!</h1>
            <p className="text-white/80 text-sm">We've received your booking request and will be in touch shortly.</p>
          </div>

          <div className="p-8">
            {/* Booking ref */}
            <div className="text-center mb-8">
              <p className="text-gray-500 text-sm mb-1">Your Booking Reference</p>
              <div className="text-4xl font-bold text-gold tracking-wider">{ref}</div>
              <p className="text-gray-400 text-xs mt-2">Keep this reference for all correspondence</p>
            </div>

            {/* Payment options */}
            <div className="bg-slate-50 rounded-xl p-5 mb-6">
              <h2 className="font-semibold text-primary mb-1">Secure Your Booking</h2>
              <p className="text-gray-500 text-sm mb-4">
                We will confirm your booking once payment is received. Choose your payment option:
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => openPayment('deposit')}
                  className="bg-teal hover:bg-teal/90 text-white py-3 px-4 rounded-xl text-sm font-semibold transition-colors"
                >
                  Pay 50% Deposit
                </button>
                <button
                  onClick={() => openPayment('full')}
                  className="bg-primary hover:bg-primary/90 text-white py-3 px-4 rounded-xl text-sm font-semibold transition-colors"
                >
                  Pay in Full
                </button>
              </div>
            </div>

            {/* Info notice */}
            <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
              <span className="text-amber-500 text-lg flex-shrink-0">ℹ</span>
              <div>
                <p className="text-amber-800 text-sm font-medium">What happens next?</p>
                <p className="text-amber-700 text-xs mt-1">
                  After your payment is received we will send a confirmation email within 24 hours.
                  A receipt and detailed itinerary will follow.
                </p>
              </div>
            </div>

            <div className="text-center">
              <Link
                to="/"
                className="text-teal hover:underline text-sm font-medium"
              >
                ← Return to Homepage
              </Link>
            </div>
          </div>
        </div>

        {/* Lookup link */}
        <p className="text-center text-gray-400 text-sm mt-6">
          Want to check your booking status?{' '}
          <Link to="/booking/lookup" className="text-teal hover:underline">Look up your booking</Link>
        </p>
      </div>

      {/* Bank Details Modal */}
      <Modal
        open={showBankModal}
        onClose={() => setShowBankModal(false)}
        title={paymentType === 'deposit' ? 'Pay 50% Deposit — Bank Details' : 'Pay in Full — Bank Details'}
      >
        <div className="space-y-4">
          <div className="bg-primary/5 rounded-xl p-5 border border-primary/10">
            <h3 className="font-semibold text-primary mb-3 text-sm uppercase tracking-wide">Transfer Details</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Bank</span>
                <span className="font-medium text-primary">First National Bank (FNB)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Account Name</span>
                <span className="font-medium text-primary">Sun Safari Destinations</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Account Number</span>
                <span className="font-medium text-primary">[Placeholder]</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Branch Code</span>
                <span className="font-medium text-primary">[Placeholder]</span>
              </div>
              <div className="flex justify-between border-t border-primary/10 pt-2 mt-2">
                <span className="text-gray-500">Reference</span>
                <span className="font-bold text-gold text-base">{ref}</span>
              </div>
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
            <strong>Important:</strong> Please use your booking reference <strong>{ref}</strong> as your payment reference.
            Once payment is received, we will confirm your booking within 24 hours.
          </div>
          <p className="text-xs text-gray-400 text-center">
            For assistance: office@sunsafaridestinations.co.za
          </p>
        </div>
      </Modal>
    </div>
  );
}
