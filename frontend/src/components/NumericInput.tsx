import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  value: number;
  onChange: (n: number) => void;
  /** Decimals to round to when re-stringifying after blur. Defaults to "as typed". */
  precision?: number;
}

/**
 * Numeric input that doesn't fight you when:
 *   - clearing the field (no auto-rendered "0")
 *   - typing after a "0" placeholder ("01" never appears)
 *   - locale uses comma as decimal separator
 *
 * Holds an internal text buffer while focused; sync to numeric state on every
 * keystroke (NaN if not parseable). Re-canonicalizes the text on blur.
 */
export default function NumericInput({ value, onChange, precision, ...rest }: Props) {
  const [text, setText] = useState(() => formatValue(value, precision));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setText(formatValue(value, precision));
  }, [value, precision]);

  return (
    <Input
      {...rest}
      type="text"
      inputMode="decimal"
      value={text}
      onFocus={(e) => {
        focusedRef.current = true;
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        focusedRef.current = false;
        // Canonicalize: if value is finite, format it; otherwise leave empty.
        setText(formatValue(value, precision));
        rest.onBlur?.(e);
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        if (raw.trim() === "" || raw === "-") {
          onChange(NaN);
          return;
        }
        // Tolerate comma decimal separator from European locales.
        const n = Number(raw.replace(",", "."));
        onChange(Number.isFinite(n) ? n : NaN);
      }}
    />
  );
}

function formatValue(v: number, precision?: number): string {
  if (!Number.isFinite(v)) return "";
  if (precision !== undefined) return v.toFixed(precision);
  return String(v);
}
