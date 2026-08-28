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
  format?: boolean;
}

export function NumberInput({ value, onCommit, allowEmpty = false, suffix, format = false, min, max, step, ...input }: NumberInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const raw = value === null || value === undefined ? '' : String(value);
  const text = draft ?? (format && !focused && raw !== '' ? Number(raw).toLocaleString('ru-RU') : raw);
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
    setFocused(false);
  };
  const field = <input type={format ? 'text' : 'number'} inputMode="decimal" {...input} {...(format ? {} : { min, max, step })} value={text} onFocus={() => setFocused(true)} onChange={(event) => change(event.target.value)} onBlur={blur} />;
  return suffix ? <span className="number-input">{field}<small>{suffix}</small></span> : field;
}

export function MoneyInput(props: Omit<NumberInputProps, 'step'> & { step?: number | string }) {
  return <NumberInput min={0} step={1000} {...props} />;
}

export function PercentInput({ value, onCommit, ...rest }: Omit<NumberInputProps, 'value' | 'onCommit'> & { value: number; onCommit: (value: number) => void }) {
  return <NumberInput value={Math.round(value * 10000) / 100} onCommit={(next) => onCommit((next ?? 0) / 100)} {...rest} />;
}
