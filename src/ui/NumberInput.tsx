import { useState } from 'react';
import { parseNumber } from '../utils';

interface NumberInputProps {
  value: number | null | undefined;
  onCommit: (value: number | null) => void;
  allowEmpty?: boolean;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  suffix?: string;
}

export function NumberInput({ value, onCommit, allowEmpty = false, suffix, ...input }: NumberInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? (value === null || value === undefined ? '' : String(value));
  const change = (next: string) => {
    setDraft(next);
    if (next.trim() === '') {
      if (allowEmpty) onCommit(null);
      return;
    }
    const parsed = parseNumber(next);
    if (parsed !== null) onCommit(parsed);
  };
  const blur = () => {
    if (draft !== null && draft.trim() === '') onCommit(allowEmpty ? null : 0);
    setDraft(null);
  };
  const field = <input type="number" inputMode="decimal" {...input} value={text} onChange={(event) => change(event.target.value)} onBlur={blur} />;
  return suffix ? <span className="number-input">{field}<small>{suffix}</small></span> : field;
}

export function MoneyInput(props: Omit<NumberInputProps, 'step'> & { step?: number | string }) {
  return <NumberInput min={0} step={1000} {...props} />;
}

export function PercentInput({ value, onCommit, ...rest }: Omit<NumberInputProps, 'value' | 'onCommit'> & { value: number; onCommit: (value: number) => void }) {
  return <NumberInput value={Math.round(value * 10000) / 100} onCommit={(next) => onCommit((next ?? 0) / 100)} {...rest} />;
}
