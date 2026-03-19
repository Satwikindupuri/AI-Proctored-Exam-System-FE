const listeners = new Set();

export function showToast(type, message, options = {}) {
  const normalizedType = message === undefined ? "info" : type;
  const normalizedMessage = message === undefined ? type : message;

  const toast = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: normalizedType,
    message: normalizedMessage,
    duration: options.duration ?? 3000,
  };

  listeners.forEach((listener) => listener(toast));
}

export function subscribeToasts(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}