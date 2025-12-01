import { Button } from "@/components/ui/button";

const DATE_RANGES = [
  { label: "Esta Semana", value: "this_week" },
  { label: "Semana Pasada", value: "last_week" },
  { label: "15 Días", value: "last_15_days" },
  { label: "Este Mes", value: "this_month" },
  { label: "Mes Pasado", value: "last_month" },
  { label: "3 Meses", value: "last_3_months" },
  { label: "6 Meses", value: "last_6_months" },
  { label: "1 Año", value: "last_1_year" },
  { label: "Siempre", value: "all_time" },
];

interface DateRangeSelectorProps {
  selectedRange: string;
  onRangeChange: (range: string) => void;
}

export const DateRangeSelector = ({
  selectedRange,
  onRangeChange,
}: DateRangeSelectorProps) => {
  return (
    <div className="flex flex-wrap items-center gap-2 hidden"> {/* Añadir 'hidden' para ocultar */}
      {DATE_RANGES.map((range) => (
        <Button
          key={range.value}
          variant={selectedRange === range.value ? "secondary" : "outline"}
          size="sm"
          onClick={() => onRangeChange(range.value)}
        >
          {range.label}
        </Button>
      ))}
    </div>
  );
};