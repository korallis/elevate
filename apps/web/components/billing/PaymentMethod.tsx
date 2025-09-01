'use client';

import React, { useState } from 'react';
import { 
  CreditCard, 
  Plus, 
  Trash2, 
  Shield, 
  AlertCircle,
  CheckCircle,
  Calendar
} from 'lucide-react';

export interface PaymentMethod {
  id: string;
  type: string;
  card?: {
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
  };
  billing_details?: {
    name: string;
    email: string;
  };
  is_default: boolean;
  created: number;
}

interface PaymentMethodProps {
  paymentMethods: PaymentMethod[];
  onAddPaymentMethod: () => void;
  onSetDefaultPaymentMethod: (paymentMethodId: string) => void;
  onRemovePaymentMethod: (paymentMethodId: string) => void;
  onUpdateBilling: () => void;
  loading?: boolean;
  className?: string;
}

const getCardIcon = (brand: string) => {
  // In a real app, you'd use actual card brand icons
  const iconClass = "w-8 h-8 rounded";
  switch (brand.toLowerCase()) {
    case 'visa':
      return <div className={`${iconClass} bg-blue-600 flex items-center justify-center text-white text-xs font-bold`}>VISA</div>;
    case 'mastercard':
      return <div className={`${iconClass} bg-red-600 flex items-center justify-center text-white text-xs font-bold`}>MC</div>;
    case 'amex':
      return <div className={`${iconClass} bg-green-600 flex items-center justify-center text-white text-xs font-bold`}>AMEX</div>;
    case 'discover':
      return <div className={`${iconClass} bg-orange-600 flex items-center justify-center text-white text-xs font-bold`}>DISC</div>;
    default:
      return <CreditCard className="w-8 h-8 text-gray-400" />;
  }
};

const formatCardNumber = (last4: string) => `•••• •••• •••• ${last4}`;

const formatExpiry = (month: number, year: number) => 
  `${month.toString().padStart(2, '0')}/${year.toString().slice(-2)}`;

const isCardExpired = (month: number, year: number) => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  
  return year < currentYear || (year === currentYear && month < currentMonth);
};

const isCardExpiringSoon = (month: number, year: number) => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  
  // Check if card expires in the next 2 months
  const expirationDate = new Date(year, month - 1);
  const twoMonthsFromNow = new Date(currentYear, currentMonth + 1);
  
  return expirationDate <= twoMonthsFromNow;
};

export function PaymentMethod({
  paymentMethods,
  onAddPaymentMethod,
  onSetDefaultPaymentMethod,
  onRemovePaymentMethod,
  onUpdateBilling,
  loading = false,
  className = ''
}: PaymentMethodProps) {
  const [showConfirmDelete, setShowConfirmDelete] = useState<string | null>(null);

  const handleRemovePaymentMethod = async (paymentMethodId: string) => {
    try {
      await onRemovePaymentMethod(paymentMethodId);
      setShowConfirmDelete(null);
    } catch (error) {
      console.error('Failed to remove payment method:', error);
    }
  };

  if (paymentMethods.length === 0) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center ${className}`}>
        <CreditCard className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No Payment Methods
        </h3>
        <p className="text-gray-500 dark:text-gray-400 mb-6">
          Add a payment method to manage your subscription and billing.
        </p>
        <button
          onClick={onAddPaymentMethod}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" />
          Add Payment Method
        </button>
      </div>
    );
  }

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 ${className}`}>
      {/* Header */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Payment Methods
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Manage your payment methods and billing information
            </p>
          </div>
          <button
            onClick={onAddPaymentMethod}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            Add New
          </button>
        </div>
      </div>

      {/* Payment Methods List */}
      <div className="p-6 space-y-4">
        {paymentMethods.map((paymentMethod) => (
          <div
            key={paymentMethod.id}
            className={`border rounded-lg p-4 transition-colors ${
              paymentMethod.is_default 
                ? 'border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800' 
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {/* Card Icon */}
                {paymentMethod.card && getCardIcon(paymentMethod.card.brand)}

                {/* Card Details */}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {paymentMethod.card && formatCardNumber(paymentMethod.card.last4)}
                    </span>
                    
                    {paymentMethod.is_default && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 text-xs font-medium rounded-full">
                        <CheckCircle className="w-3 h-3" />
                        Default
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                    {paymentMethod.card && (
                      <>
                        <span className="capitalize">
                          {paymentMethod.card.brand} •••• {paymentMethod.card.last4}
                        </span>
                        
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          <span>
                            {formatExpiry(paymentMethod.card.exp_month, paymentMethod.card.exp_year)}
                          </span>
                          
                          {isCardExpired(paymentMethod.card.exp_month, paymentMethod.card.exp_year) && (
                            <span className="text-red-500 font-medium ml-1">(Expired)</span>
                          )}
                          
                          {!isCardExpired(paymentMethod.card.exp_month, paymentMethod.card.exp_year) &&
                           isCardExpiringSoon(paymentMethod.card.exp_month, paymentMethod.card.exp_year) && (
                            <span className="text-orange-500 font-medium ml-1">(Expires Soon)</span>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {paymentMethod.billing_details?.name && (
                    <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {paymentMethod.billing_details.name}
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                {!paymentMethod.is_default && (
                  <button
                    onClick={() => onSetDefaultPaymentMethod(paymentMethod.id)}
                    disabled={loading}
                    className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Make Default
                  </button>
                )}

                <button
                  onClick={() => setShowConfirmDelete(paymentMethod.id)}
                  disabled={loading || (paymentMethods.length === 1)}
                  className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title={paymentMethods.length === 1 ? "Cannot remove the last payment method" : "Remove payment method"}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Expiration Warning */}
            {paymentMethod.card && 
             !isCardExpired(paymentMethod.card.exp_month, paymentMethod.card.exp_year) &&
             isCardExpiringSoon(paymentMethod.card.exp_month, paymentMethod.card.exp_year) && (
              <div className="mt-3 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-orange-600" />
                  <span className="text-sm text-orange-800 dark:text-orange-200">
                    This card expires soon. Consider updating your payment method.
                  </span>
                </div>
              </div>
            )}

            {/* Expired Card Warning */}
            {paymentMethod.card && 
             isCardExpired(paymentMethod.card.exp_month, paymentMethod.card.exp_year) && (
              <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600" />
                  <span className="text-sm text-red-800 dark:text-red-200">
                    This card has expired. Please update your payment method.
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Security Notice */}
      <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
        <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
          <Shield className="w-4 h-4" />
          <span>
            Your payment information is securely processed and encrypted. We never store your full card details.
          </span>
        </div>
      </div>

      {/* Billing Portal Link */}
      <div className="p-6 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={onUpdateBilling}
          disabled={loading}
          className="w-full px-4 py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg font-medium hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <div className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-white dark:border-gray-900 border-t-transparent rounded-full animate-spin"></div>
              Loading...
            </div>
          ) : (
            'Manage All Billing Settings'
          )}
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      {showConfirmDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Remove Payment Method
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Are you sure you want to remove this payment method? This action cannot be undone.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmDelete(null)}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRemovePaymentMethod(showConfirmDelete)}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PaymentMethod;