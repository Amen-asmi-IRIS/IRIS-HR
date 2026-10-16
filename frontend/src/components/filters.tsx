import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

const labelClass = "text-caption text-muted-foreground";

interface FilterTextProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "search" | "date";
}

export function FilterText({ label, value, onChange, type = "search" }: FilterTextProps) {
  const id = useId();
  return (
    <div className="flex w-full flex-col gap-1 md:w-56">
      <Label htmlFor={id} className={labelClass}>
        {label}
      </Label>
      <Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

interface FilterSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}

export function FilterSelect({ label, value, onChange, options }: FilterSelectProps) {
  const id = useId();
  return (
    <div className="flex w-full flex-col gap-1 md:w-56">
      <Label htmlFor={id} className={labelClass}>
        {label}
      </Label>
      <NativeSelect id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

interface FilterDateRangeProps {
  label: string;
  from: string;
  to: string;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
}

/** One filter made of two dates. The two boxes may shrink: side by side they are wider than a small phone. */
export function FilterDateRange({ label, from, to, onFrom, onTo }: FilterDateRangeProps) {
  const { t } = useTranslation();
  const fromId = useId();
  const toId = useId();
  return (
    <fieldset className="m-0 flex w-full min-w-0 flex-col gap-1 border-0 p-0 md:w-auto">
      <legend className={`${labelClass} mb-1 p-0 font-medium`}>{label}</legend>
      <div className="flex items-center gap-2">
        <Label htmlFor={fromId} className="sr-only">
          {t("filters.from")}
        </Label>
        <Input id={fromId} type="date" className="min-w-0" value={from} max={to || undefined} onChange={(event) => onFrom(event.target.value)} />
        <span aria-hidden="true" className="text-muted-foreground">
          /
        </span>
        <Label htmlFor={toId} className="sr-only">
          {t("filters.to")}
        </Label>
        <Input id={toId} type="date" className="min-w-0" value={to} min={from || undefined} onChange={(event) => onTo(event.target.value)} />
      </div>
    </fieldset>
  );
}
