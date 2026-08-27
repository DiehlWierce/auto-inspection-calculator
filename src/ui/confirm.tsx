import { useEffect, useState } from 'react';

export interface ConfirmOptions {
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'neutral';
}

type Request = ConfirmOptions & { resolve: (value: boolean) => void };

let openDialog: ((options: ConfirmOptions) => Promise<boolean>) | null = null;

/**
 * Подтверждение действия. Использует внутридиалоговое окно приложения,
 * а не `window.confirm`: нативный диалог в PWA на телефоне блокирует поток
 * и выглядит как системная ошибка. Если хост-компонент почему-то не смонтирован,
 * функция откатывается на `window.confirm`, чтобы действие не потерялось.
 */
export function confirmAction(options: string | ConfirmOptions): Promise<boolean> {
  const normalized = typeof options === 'string' ? { message: options } : options;
  if (!openDialog) return Promise.resolve(window.confirm(normalized.message));
  return openDialog(normalized);
}

/** Монтируется один раз в корне приложения и отрисовывает окно подтверждения. */
export function ConfirmHost() {
  const [request, setRequest] = useState<Request | null>(null);

  useEffect(() => {
    openDialog = (options) =>
      new Promise<boolean>((resolve) => {
        setRequest({ ...options, resolve });
      });
    return () => {
      openDialog = null;
    };
  }, []);

  useEffect(() => {
    if (!request) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        request.resolve(false);
        setRequest(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [request]);

  if (!request) return null;

  const close = (value: boolean) => {
    request.resolve(value);
    setRequest(null);
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={() => close(false)}>
      <div
        className="modal-card"
        role="alertdialog"
        aria-modal="true"
        aria-label={request.message}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="modal-title">{request.message}</h2>
        {request.detail ? <p className="modal-detail">{request.detail}</p> : null}
        <div className="modal-actions">
          <button type="button" className="ghost-button" onClick={() => close(false)}>
            {request.cancelLabel ?? 'Отмена'}
          </button>
          <button
            type="button"
            className={request.tone === 'neutral' ? 'primary-button' : 'danger-button'}
            autoFocus
            onClick={() => close(true)}
          >
            {request.confirmLabel ?? 'Удалить'}
          </button>
        </div>
      </div>
    </div>
  );
}
