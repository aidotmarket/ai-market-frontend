'use client';

import { useState, useEffect, useCallback, createContext, useContext } from 'react';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ToastContextValue {
  toast: (message: string, type?: Toast['type']) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 5000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const bg =
    toast.type === 'error'
      ? 'bg-red-600'
      : toast.type === 'success'
        ? 'bg-green-600'
        : 'bg-gray-800';

  return (
    <div
      className={`${bg} text-white px-4 py-3 rounded-lg shadow-lg max-w-sm animate-[slideIn_0.2s_ease-out]`}
      role="alert"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm">{toast.message}</p>
        <button
          onClick={() => onDismiss(toast.id)}
          className="text-white/70 hover:text-white shrink-0"
        >
          &times;
        </button>
      </div>
    </div>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
