import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { clearAll } from '../storage/db';

interface Props { children: ReactNode }
interface State { error: Error | null }

/**
 * Without this, a single bad record makes React unmount the whole tree and the app renders
 * nothing at all — recoverable only by clearing site data from browser settings.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Автоосмотр: сбой отрисовки', error, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  private wipe = (): void => {
    if (!window.confirm('Удалить все локальные данные приложения — осмотры и настройки? Действие нельзя отменить, восстановить можно только из резервной копии.')) return;
    void clearAll().catch(() => undefined).then(() => window.location.reload());
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="crash-screen">
        <h1>Приложение не смогло отрисоваться</h1>
        <p>Скорее всего, в локальном хранилище лежат данные, которые приложение не понимает.</p>
        <pre>{error.message}</pre>
        <div className="crash-actions">
          <button className="ghost-button" onClick={this.reset}>Попробовать снова</button>
          <button className="danger-button" onClick={this.wipe}>Очистить локальные данные</button>
        </div>
      </div>
    );
  }
}
