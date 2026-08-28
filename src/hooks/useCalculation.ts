import { useMemo } from 'react';
import { calculateInspection } from '../calc';
import type { CalculationResult, Inspection } from '../types';

export function useCalculation(inspections: Inspection[]): Map<string, CalculationResult> {
  return useMemo(() => new Map(inspections.map((inspection) => [inspection.id, calculateInspection(inspection, inspection.configSnapshot, { withRisk: false })])), [inspections]);
}
