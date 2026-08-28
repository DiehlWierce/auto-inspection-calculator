import { ACCIDENT_OUTCOME_LABELS, DOCUMENT_LABELS, TIMING_DRIVE_LABELS } from '../../domain/labels';
import { engineVariant } from '../../domain/vehicle';
import type { AppConfig, Inspection } from '../../types';

export function VehicleInfoSummary({ vehicle, config, onEdit }: { vehicle: Inspection['vehicle']; config: AppConfig; onEdit: () => void }) {
  const variant = engineVariant(config, vehicle);
  const accidentLabel = vehicle.accidentStatus === 'YES' ? 'ДТП было' : vehicle.accidentStatus === 'NO' ? 'ДТП не заявлено' : 'ДТП не проверено';
  const hasAttention = vehicle.documentsStatus === 'DUPLICATE_WITHOUT_ORIGINAL' || (vehicle.keyCount !== undefined && vehicle.keyCount < 2) || vehicle.accidentStatus === 'YES' || vehicle.accidentStatus === 'UNKNOWN';
  return <div className={`vehicle-info-summary ${hasAttention ? 'attention' : ''}`}><div><span className="summary-label">ИНФОРМАЦИЯ ДЛЯ РЕШЕНИЯ</span><strong>{DOCUMENT_LABELS[vehicle.documentsStatus ?? 'UNKNOWN']}</strong></div><div><span>Двигатель / ГРМ</span><strong>{variant ? `${variant.code || 'Код не указан'} · ${TIMING_DRIVE_LABELS[variant.timingDrive]}` : 'Не указано'}</strong></div><div><span>Ключи</span><strong>{vehicle.keyCount === undefined ? 'Не указано' : `${vehicle.keyCount} шт.`}</strong></div><div><span>История ДТП</span><strong>{accidentLabel}</strong></div>{vehicle.accidentStatus === 'YES' && <div className="accident-outcomes"><span>Результат</span><strong>{vehicle.accidentOutcomes?.length ? vehicle.accidentOutcomes.map((outcome) => ACCIDENT_OUTCOME_LABELS[outcome] ?? outcome).join(' · ') : 'Не описан'}</strong></div>}{vehicle.listingUrl && <a className="listing-link" href={vehicle.listingUrl} target="_blank" rel="noreferrer">Открыть объявление</a>}<button className="text-button" onClick={onEdit}>Изменить</button></div>;
}
