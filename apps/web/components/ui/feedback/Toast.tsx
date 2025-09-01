'use client';

import { Toaster, toast } from 'react-hot-toast';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';

/**
 * Toast notification system using react-hot-toast
 */

// Custom toast styles
const toastStyles = {
  success: {
    style: {
      background: '#10b981',
      color: '#ffffff',
      border: '1px solid #059669',
      borderRadius: '8px',
      padding: '12px 16px',
    },
    iconTheme: {
      primary: '#ffffff',
      secondary: '#10b981',
    },
  },
  error: {
    style: {
      background: '#ef4444',
      color: '#ffffff',
      border: '1px solid #dc2626',
      borderRadius: '8px',
      padding: '12px 16px',
    },
    iconTheme: {
      primary: '#ffffff',
      secondary: '#ef4444',
    },
  },
  warning: {
    style: {
      background: '#f59e0b',
      color: '#ffffff',
      border: '1px solid #d97706',
      borderRadius: '8px',
      padding: '12px 16px',
    },
    iconTheme: {
      primary: '#ffffff',
      secondary: '#f59e0b',
    },
  },
  info: {
    style: {
      background: '#3b82f6',
      color: '#ffffff',
      border: '1px solid #2563eb',
      borderRadius: '8px',
      padding: '12px 16px',
    },
    iconTheme: {
      primary: '#ffffff',
      secondary: '#3b82f6',
    },
  },
} as const;

/**
 * Success toast
 */
export const showSuccessToast = (message: string, options?: {
  duration?: number;
  position?: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
}) => {
  return toast.success(message, {
    duration: options?.duration || 4000,
    position: options?.position || 'top-right',
    ...toastStyles.success,
    icon: <CheckCircle className="w-5 h-5" />,
  });
};

/**
 * Error toast
 */
export const showErrorToast = (message: string, options?: {
  duration?: number;
  position?: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
}) => {
  return toast.error(message, {
    duration: options?.duration || 6000,
    position: options?.position || 'top-right',
    ...toastStyles.error,
    icon: <XCircle className="w-5 h-5" />,
  });
};

/**
 * Warning toast
 */
export const showWarningToast = (message: string, options?: {
  duration?: number;
  position?: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
}) => {
  return toast(message, {
    duration: options?.duration || 5000,
    position: options?.position || 'top-right',
    ...toastStyles.warning,
    icon: <AlertCircle className="w-5 h-5" />,
  });
};

/**
 * Info toast
 */
export const showInfoToast = (message: string, options?: {
  duration?: number;
  position?: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
}) => {
  return toast(message, {
    duration: options?.duration || 4000,
    position: options?.position || 'top-right',
    ...toastStyles.info,
    icon: <Info className="w-5 h-5" />,
  });
};

/**
 * Loading toast
 */
export const showLoadingToast = (message: string = 'Loading...') => {
  return toast.loading(message, {
    style: {
      background: '#6b7280',
      color: '#ffffff',
      border: '1px solid #4b5563',
      borderRadius: '8px',
      padding: '12px 16px',
    },
  });
};

/**
 * Custom toast with action button
 */
export const showActionToast = (
  message: string,
  actionText: string,
  onAction: () => void,
  options?: {
    type?: 'success' | 'error' | 'warning' | 'info';
    duration?: number;
  }
) => {
  const type = options?.type || 'info';
  const styles = toastStyles[type];

  return toast.custom((t) => (
    <div
      className={`${
        t.visible ? 'animate-enter' : 'animate-leave'
      } max-w-md w-full bg-white shadow-lg rounded-lg pointer-events-auto flex ring-1 ring-black ring-opacity-5`}
    >
      <div className="flex-1 w-0 p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            {type === 'success' && <CheckCircle className="h-6 w-6 text-green-400" />}
            {type === 'error' && <XCircle className="h-6 w-6 text-red-400" />}
            {type === 'warning' && <AlertCircle className="h-6 w-6 text-yellow-400" />}
            {type === 'info' && <Info className="h-6 w-6 text-blue-400" />}
          </div>
          <div className="ml-3 flex-1">
            <p className="text-sm font-medium text-gray-900">{message}</p>
          </div>
        </div>
      </div>
      <div className="flex border-l border-gray-200">
        <button
          onClick={() => {
            onAction();
            toast.dismiss(t.id);
          }}
          className="w-full border border-transparent rounded-none rounded-r-lg p-4 flex items-center justify-center text-sm font-medium text-indigo-600 hover:text-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {actionText}
        </button>
      </div>
      <div className="flex border-l border-gray-200">
        <button
          onClick={() => toast.dismiss(t.id)}
          className="w-full border border-transparent rounded-none rounded-r-lg p-4 flex items-center justify-center hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <X className="h-4 w-4 text-gray-400" />
        </button>
      </div>
    </div>
  ), {
    duration: options?.duration || 8000,
  });
};

/**
 * Promise toast - shows loading, then success/error
 */
export const showPromiseToast = <T,>(
  promise: Promise<T>,
  messages: {
    loading: string;
    success: string | ((data: T) => string);
    error: string | ((error: any) => string);
  },
  options?: {
    duration?: number;
  }
) => {
  return toast.promise(promise, messages, {
    loading: {
      style: {
        background: '#6b7280',
        color: '#ffffff',
      },
    },
    success: {
      duration: options?.duration || 4000,
      ...toastStyles.success,
      icon: <CheckCircle className="w-5 h-5" />,
    },
    error: {
      duration: options?.duration || 6000,
      ...toastStyles.error,
      icon: <XCircle className="w-5 h-5" />,
    },
  });
};

/**
 * Dismiss all toasts
 */
export const dismissAllToasts = () => {
  toast.dismiss();
};

/**
 * Dismiss specific toast
 */
export const dismissToast = (toastId: string) => {
  toast.dismiss(toastId);
};

/**
 * Toast provider component to be used in app layout
 */
export const ToastProvider = () => {
  return (
    <Toaster
      position="top-right"
      gutter={8}
      containerClassName=""
      containerStyle={{}}
      toastOptions={{
        // Default options for all toasts
        duration: 4000,
        style: {
          background: '#363636',
          color: '#fff',
          borderRadius: '8px',
          padding: '16px',
          fontSize: '14px',
          maxWidth: '500px',
        },
        // Custom styles for different types
        success: {
          duration: 4000,
          iconTheme: {
            primary: '#10b981',
            secondary: '#ffffff',
          },
        },
        error: {
          duration: 6000,
          iconTheme: {
            primary: '#ef4444',
            secondary: '#ffffff',
          },
        },
        loading: {
          iconTheme: {
            primary: '#6b7280',
            secondary: '#ffffff',
          },
        },
      }}
    />
  );
};

/**
 * Hook for using toasts in components
 */
export const useToast = () => {
  return {
    success: showSuccessToast,
    error: showErrorToast,
    warning: showWarningToast,
    info: showInfoToast,
    loading: showLoadingToast,
    promise: showPromiseToast,
    action: showActionToast,
    dismiss: dismissToast,
    dismissAll: dismissAllToasts,
  };
};

export default ToastProvider;