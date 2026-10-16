import dayjs from 'dayjs';

import { WEEK_START } from '../constants';

export const DAY_FORMAT = 'YYYY-MM-DD';
export const MONTH_FORMAT = 'YYYY-MM';

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// dayjs' day() of the first column: 0 (Sunday) or 1 (Monday).
const getWeekStartDay = (weekStart) =>
  weekStart === WEEK_START.SUNDAY ? 0 : 1;

export const getWeekdayNames = (weekStart) =>
  weekStart === WEEK_START.SUNDAY
    ? WEEKDAY_NAMES
    : [...WEEKDAY_NAMES.slice(1), WEEKDAY_NAMES[0]];

export const getMonthOfDay = (day) => day.slice(0, MONTH_FORMAT.length);

export const addMonths = (month, delta) =>
  dayjs(`${month}-01`).add(delta, 'month').format(MONTH_FORMAT);

export const getMonthDays = (month) => {
  const first = dayjs(`${month}-01`);
  return Array.from({ length: first.daysInMonth() }, (_, index) =>
    first.add(index, 'day').format(DAY_FORMAT)
  );
};

// Cells of a month grid: null for leading/trailing out-of-month slots,
// otherwise the 'YYYY-MM-DD' day.
export const getMonthCells = (month, weekStart) => {
  const days = getMonthDays(month);
  const leading = (dayjs(days[0]).day() - getWeekStartDay(weekStart) + 7) % 7;
  const trailing = (7 - ((leading + days.length) % 7)) % 7;
  return [...Array(leading).fill(null), ...days, ...Array(trailing).fill(null)];
};

// Unbroken week rows (7 'YYYY-MM-DD' days each) from the week containing the
// 1st of firstMonth to the week containing the last day of lastMonth. A week
// spanning two months holds days of both. Calendar-day arithmetic keeps DST
// changes from skipping or repeating a day.
export const getWeekRows = (firstMonth, lastMonth, weekStart) => {
  const first = dayjs(`${firstMonth}-01`);
  const lastDay = dayjs(`${lastMonth}-01`).endOf('month').format(DAY_FORMAT);
  let weekFirst = first.subtract(
    (first.day() - getWeekStartDay(weekStart) + 7) % 7,
    'day'
  );
  const rows = [];
  while (weekFirst.format(DAY_FORMAT) <= lastDay) {
    const start = weekFirst;
    rows.push(
      Array.from({ length: 7 }, (_, index) =>
        start.add(index, 'day').format(DAY_FORMAT)
      )
    );
    weekFirst = weekFirst.add(7, 'day');
  }
  return rows;
};
