import {
  startOfWeek,
  endOfWeek,
  subDays,
  subMonths,
  subYears,
  startOfMonth,
  endOfMonth,
  subWeeks,
} from "date-fns";
import { DateRange } from "react-day-picker";

export const calculateDateRange = (
  rangeKey: string
): DateRange | undefined => {
  const now = new Date();
  let from: Date;
  let to: Date = now;

  switch (rangeKey) {
    case "this_week":
      from = startOfWeek(now, { weekStartsOn: 1 });
      to = endOfWeek(now, { weekStartsOn: 1 });
      break;
    case "last_week":
      const lastWeek = subWeeks(now, 1);
      from = startOfWeek(lastWeek, { weekStartsOn: 1 });
      to = endOfWeek(lastWeek, { weekStartsOn: 1 });
      break;
    case "last_15_days":
      from = subDays(now, 14); // 15 days including today
      break;
    case "this_month":
      from = startOfMonth(now);
      to = endOfMonth(now);
      break;
    case "last_month":
      const lastMonth = subMonths(now, 1);
      from = startOfMonth(lastMonth);
      to = endOfMonth(lastMonth);
      break;
    case "last_3_months":
      from = subMonths(now, 3);
      break;
    case "last_6_months":
      from = subMonths(now, 6);
      break;
    case "last_1_year":
      from = subYears(now, 1);
      break;
    case "all_time":
      return undefined; // Special case for no date filter
    default:
      from = subMonths(now, 3); // Default to last 3 months
  }
  return { from, to };
};