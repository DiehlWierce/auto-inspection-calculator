import { useDeferredValue, useMemo } from 'react';
import { calculateInspection } from '../calc';
import type { CalculationResult, Inspection } from '../types';

export function useForecastRisk(inspection: Inspection, base: CalculationResult): CalculationResult {
  const deferred = useDeferredValue<Inspection | null>(inspection, null);
  const withRisk = useMemo(() => deferred === null ? null : calculateInspection(deferred, deferred.configSnapshot, { withRisk: true }), [deferred]);
  return deferred === inspection && withRisk ? withRisk : base;
}
