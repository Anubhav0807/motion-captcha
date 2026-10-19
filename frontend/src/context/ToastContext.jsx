import { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback((message, tone = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => dismiss(id), 4200);
  }, [dismiss]);

  const toast = {
    success: (m) => push(m, 'ok'),
    error: (m) => push(m?.message || m || 'Something went wrong', 'error'),
    info: (m) => push(m, 'info'),
  };

  const icons = { ok: CheckCircle2, error: AlertTriangle, info: Info };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => {
          const Icon = icons[t.tone];
          return (
            <div key={t.id} className={`toast toast-${t.tone}`}>
              <Icon size={16} />
              <span>{t.message}</span>
              <button className="toast-x" onClick={() => dismiss(t.id)} aria-label="Dismiss"><X size={14} /></button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
