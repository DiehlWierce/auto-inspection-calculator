import { useEffect, useState } from 'react';
import { uid } from '../utils';

export type NoticeTone = 'info' | 'success' | 'error';

export interface Notice {
  id: string;
  message: string;
  tone: NoticeTone;
}

let push: ((notice: Notice) => void) | null = null;

/** Показывает уведомление вместо `window.alert`. */
export function notify(message: string, tone: NoticeTone = 'info'): void {
  const notice: Notice = { id: uid(), message, tone };
  if (!push) {
    if (tone === 'error') window.alert(message);
    return;
  }
  push(notice);
}

/** Монтируется один раз в корне приложения. */
export function NotificationHost() {
  const [notices, setNotices] = useState<Notice[]>([]);

  useEffect(() => {
    push = (notice) => setNotices((current) => [...current, notice]);
    return () => {
      push = null;
    };
  }, []);

  useEffect(() => {
    if (notices.length === 0) return;
    const timer = window.setTimeout(() => setNotices((current) => current.slice(1)), 6000);
    return () => window.clearTimeout(timer);
  }, [notices]);

  if (notices.length === 0) return null;

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {notices.map((notice) => (
        <div key={notice.id} className={`toast toast-${notice.tone}`}>
          <span>{notice.message}</span>
          <button
            type="button"
            className="toast-close"
            aria-label="Закрыть уведомление"
            onClick={() => setNotices((current) => current.filter((item) => item.id !== notice.id))}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
