import { useEffect, useState } from "react";
import { subscribeToasts } from "../utils/toast";
import "../styles/AppToast.css";

export default function AppToast() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    return subscribeToasts((toast) => {
      setToasts((prev) => [...prev, toast]);

      window.setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== toast.id));
      }, toast.duration);
    });
  }, []);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="app-toast-stack" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div key={toast.id} className={`app-toast app-toast--${toast.type}`}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}