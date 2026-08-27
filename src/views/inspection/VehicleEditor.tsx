import { useState } from 'react';
import type { FormEvent } from 'react';
import { numberValue } from '../../utils';
import { ACCIDENT_OUTCOME_LABELS, DOCUMENT_LABELS, TIMING_DRIVE_LABELS } from '../../labels';
import { engineVariant, modelName, modelProfile } from '../../domain/inspection';
import { Field } from '../../components/primitives';
import type { AppConfig, Inspection, ModelId } from '../../types';

export function VehicleInfoSummary({
  vehicle,
  config,
  onEdit,
}: {
  vehicle: Inspection['vehicle'];
  config: AppConfig;
  onEdit: () => void;
}) {
  const variant = engineVariant(config, vehicle);
  const accidentLabel =
    vehicle.accidentStatus === 'YES'
      ? 'ДТП было'
      : vehicle.accidentStatus === 'NO'
        ? 'ДТП не заявлено'
        : 'ДТП не проверено';
  const hasAttention =
    vehicle.documentsStatus === 'DUPLICATE_WITHOUT_ORIGINAL' ||
    (vehicle.keyCount !== undefined && vehicle.keyCount < 2) ||
    vehicle.accidentStatus === 'YES' ||
    vehicle.accidentStatus === 'UNKNOWN';
  return (
    <div className={`vehicle-info-summary ${hasAttention ? 'attention' : ''}`}>
      <div>
        <span className="summary-label">ИНФОРМАЦИЯ ДЛЯ РЕШЕНИЯ</span>
        <strong>{DOCUMENT_LABELS[vehicle.documentsStatus ?? 'UNKNOWN']}</strong>
      </div>
      <div>
        <span>Двигатель / ГРМ</span>
        <strong>
          {variant ? `${variant.code || 'Код не указан'} · ${TIMING_DRIVE_LABELS[variant.timingDrive]}` : 'Не указано'}
        </strong>
      </div>
      <div>
        <span>Ключи</span>
        <strong>{vehicle.keyCount === undefined ? 'Не указано' : `${vehicle.keyCount} шт.`}</strong>
      </div>
      <div>
        <span>История ДТП</span>
        <strong>{accidentLabel}</strong>
      </div>
      {vehicle.accidentStatus === 'YES' && (
        <div className="accident-outcomes">
          <span>Результат</span>
          <strong>
            {vehicle.accidentOutcomes?.length
              ? vehicle.accidentOutcomes.map((outcome) => ACCIDENT_OUTCOME_LABELS[outcome] ?? outcome).join(' · ')
              : 'Не описан'}
          </strong>
        </div>
      )}
      {vehicle.listingUrl && (
        <a className="listing-link" href={vehicle.listingUrl} target="_blank" rel="noreferrer">
          Открыть объявление
        </a>
      )}
      <button type="button" className="text-button" onClick={onEdit}>
        Изменить
      </button>
    </div>
  );
}

export function VehicleEditor({
  inspection,
  onSave,
  onCancel,
}: {
  inspection: Inspection;
  onSave: (inspection: Inspection) => void;
  onCancel: () => void;
}) {
  const [vehicle, setVehicle] = useState({
    ...inspection.vehicle,
    accidentOutcomes: inspection.vehicle.accidentOutcomes ?? [],
  });
  const [pricing, setPricing] = useState({
    ...inspection.pricing,
    actualPurchasePrice: inspection.pricing.actualPurchasePrice?.toString() ?? '',
  });
  const selectedModel = modelProfile(inspection.configSnapshot, vehicle.modelId);
  const selectedVariant = engineVariant(inspection.configSnapshot, vehicle);
  const changeModel = (modelId: ModelId) =>
    setVehicle((current) => ({
      ...current,
      modelId,
      engineVariantId: modelProfile(inspection.configSnapshot, modelId).engineVariants[0]?.id ?? 'unknown',
    }));
  const toggleOutcome = (outcome: string) =>
    setVehicle((current) => ({
      ...current,
      accidentOutcomes: current.accidentOutcomes.includes(outcome)
        ? current.accidentOutcomes.filter((item) => item !== outcome)
        : [...current.accidentOutcomes, outcome],
    }));
  const save = (event: FormEvent) => {
    event.preventDefault();
    onSave({
      ...inspection,
      vehicle: { ...vehicle, accidentOutcomes: vehicle.accidentOutcomes },
      pricing: {
        askingPrice: numberValue(String(pricing.askingPrice)),
        expectedDiscount: numberValue(String(pricing.expectedDiscount)),
        actualPurchasePrice: pricing.actualPurchasePrice ? numberValue(pricing.actualPurchasePrice) : undefined,
      },
    });
  };
  return (
    <form className="vehicle-editor" onSubmit={save}>
      <div className="form-section-title">
        <div>
          <span className="step-chip">КАРТОЧКА АВТОМОБИЛЯ</span>
          <strong>Дополнить или исправить данные</strong>
        </div>
        <button type="button" className="text-button" onClick={onCancel}>
          Закрыть
        </button>
      </div>
      <div className="form-grid three">
        <Field label="Модель">
          <select value={vehicle.modelId} onChange={(event) => changeModel(event.target.value)}>
            {inspection.configSnapshot.models.map((model) => (
              <option key={model.id} value={model.id}>
                {modelName(inspection.configSnapshot, model.id)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Год">
          <input
            type="number"
            min="0"
            value={vehicle.year}
            onChange={(event) => setVehicle({ ...vehicle, year: numberValue(event.target.value) })}
          />
        </Field>
        <Field label="Пробег, км">
          <input
            type="number"
            min="0"
            value={vehicle.mileage}
            onChange={(event) => setVehicle({ ...vehicle, mileage: numberValue(event.target.value) })}
          />
        </Field>
      </div>
      <div className="form-grid two">
        <Field label="Двигатель и ГРМ">
          <select
            value={selectedVariant?.id ?? ''}
            onChange={(event) => setVehicle({ ...vehicle, engineVariantId: event.target.value })}
          >
            {selectedModel.engineVariants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="engine-fact">
          <span>Текущий выбор</span>
          <strong>
            {selectedVariant
              ? `${selectedVariant.code || 'Код не указан'} · ${TIMING_DRIVE_LABELS[selectedVariant.timingDrive]}`
              : 'Не определён'}
          </strong>
        </div>
      </div>
      <div className="form-grid three">
        <Field label="VIN">
          <input value={vehicle.vin ?? ''} onChange={(event) => setVehicle({ ...vehicle, vin: event.target.value })} />
        </Field>
        <Field label="Госномер">
          <input
            value={vehicle.plate ?? ''}
            onChange={(event) => setVehicle({ ...vehicle, plate: event.target.value })}
          />
        </Field>
        <Field label="Источник">
          <input
            value={vehicle.listingSource ?? ''}
            onChange={(event) => setVehicle({ ...vehicle, listingSource: event.target.value })}
          />
        </Field>
      </div>
      <Field label="Ссылка на объявление">
        <input
          type="url"
          value={vehicle.listingUrl ?? ''}
          onChange={(event) => setVehicle({ ...vehicle, listingUrl: event.target.value || undefined })}
          placeholder="https://…"
        />
      </Field>
      <div className="form-grid three">
        <Field label="Цена объявления, ₽">
          <input
            type="number"
            min="0"
            value={pricing.askingPrice}
            onChange={(event) => setPricing({ ...pricing, askingPrice: numberValue(event.target.value) })}
          />
        </Field>
        <Field label="Ожидаемый торг, ₽">
          <input
            type="number"
            min="0"
            value={pricing.expectedDiscount}
            onChange={(event) => setPricing({ ...pricing, expectedDiscount: numberValue(event.target.value) })}
          />
        </Field>
        <Field label="Фактическая цена, ₽">
          <input
            type="number"
            min="0"
            value={pricing.actualPurchasePrice}
            onChange={(event) => setPricing({ ...pricing, actualPurchasePrice: event.target.value })}
            placeholder="Пока неизвестна"
          />
        </Field>
      </div>
      <div className="form-grid three">
        <Field label="Документы">
          <select
            value={vehicle.documentsStatus ?? 'UNKNOWN'}
            onChange={(event) =>
              setVehicle({ ...vehicle, documentsStatus: event.target.value as typeof vehicle.documentsStatus })
            }
          >
            {Object.entries(DOCUMENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Количество ключей">
          <input
            type="number"
            min="0"
            max="5"
            value={vehicle.keyCount ?? ''}
            onChange={(event) =>
              setVehicle({
                ...vehicle,
                keyCount: event.target.value === '' ? undefined : numberValue(event.target.value),
              })
            }
          />
        </Field>
        <Field label="ДТП">
          <select
            value={vehicle.accidentStatus ?? 'UNKNOWN'}
            onChange={(event) =>
              setVehicle({ ...vehicle, accidentStatus: event.target.value as typeof vehicle.accidentStatus })
            }
          >
            <option value="NO">Не было</option>
            <option value="YES">Было</option>
            <option value="UNKNOWN">Неизвестно</option>
          </select>
        </Field>
      </div>
      {vehicle.accidentStatus === 'YES' && (
        <>
          <div className="risk-picker">
            <span className="field-label">Результаты ДТП</span>
            <div className="check-grid">
              {Object.entries(ACCIDENT_OUTCOME_LABELS).map(([outcome, label]) => (
                <label key={outcome} className="check-item">
                  <input
                    type="checkbox"
                    checked={vehicle.accidentOutcomes.includes(outcome)}
                    onChange={() => toggleOutcome(outcome)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <Field label="Комментарий по ДТП">
            <textarea
              rows={2}
              value={vehicle.accidentComment ?? ''}
              onChange={(event) => setVehicle({ ...vehicle, accidentComment: event.target.value })}
            />
          </Field>
        </>
      )}
      <div className="form-actions">
        <button type="button" className="ghost-button" onClick={onCancel}>
          Отмена
        </button>
        <button type="submit" className="primary-button">
          Сохранить данные
        </button>
      </div>
    </form>
  );
}
