import { createSlice, createSelector } from '@reduxjs/toolkit';
import dayjs from 'dayjs';

import { selectCalendarEvents } from './calendarEvents';
import { selectSelectedCalendar } from './viewState';
import { getConfig, updateConfig } from './storage';
import roundHours from '../utils/roundHours';

export const MONTHS_SHOWN_OPTIONS = [1, 3, 12];
const DEFAULT_MONTHS_SHOWN = 1;

// Planner layouts: one continuous stream of weeks, or separate month cards
// (monthsShown of them).
export const PLANNER_LAYOUT = {
  CONTINUOUS: 'continuous',
  MONTHS: 'months',
};
const PLANNER_LAYOUTS = Object.values(PLANNER_LAYOUT);

const DAY_FORMAT = 'YYYY-MM-DD';
const MONTH_FORMAT = 'YYYY-MM';
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^\d{4}-\d{2}$/;
const MS_PER_HOUR = 1000 * 60 * 60;

// Parse strictly: dayjs happily rolls over invalid dates like 2026-02-31, so
// require that formatting the parsed value gives back the input.
const isValidDay = (day) =>
  typeof day === 'string' &&
  DAY_PATTERN.test(day) &&
  dayjs(day).format(DAY_FORMAT) === day;

const isValidMonth = (month) =>
  typeof month === 'string' &&
  MONTH_PATTERN.test(month) &&
  dayjs(`${month}-01`).format(MONTH_FORMAT) === month;

const getCurrentMonth = () => dayjs().format(MONTH_FORMAT);

// 'YYYY-MM-DD' strings sort chronologically as plain strings.
const normalizeDays = (days) => [...new Set(days.filter(isValidDay))].sort();

// Inclusive list of days between two 'YYYY-MM-DD' strings, in either order.
// Uses dayjs' calendar-day arithmetic (not fixed 24h steps) so DST changes
// can't skip or repeat a day.
const getDaysInRange = (from, to) => {
  let cursor = dayjs(from < to ? from : to);
  const last = from < to ? to : from;
  const days = [];
  while (cursor.format(DAY_FORMAT) <= last) {
    days.push(cursor.format(DAY_FORMAT));
    cursor = cursor.add(1, 'day');
  }
  return days;
};

const getDaysInMonth = (month) => {
  const start = dayjs(`${month}-01`);
  return getDaysInRange(
    start.format(DAY_FORMAT),
    start.endOf('month').format(DAY_FORMAT)
  );
};

const addDays = (selectedDays, days) =>
  normalizeDays([...selectedDays, ...days]);

const removeDays = (selectedDays, days) => {
  const toRemove = new Set(days);
  return selectedDays.filter((day) => !toRemove.has(day));
};

// Selected days after selecting (or deselecting) the inclusive range
// from..to. Shared by the reducer and the planner's drag preview.
export const applyDaysSelected = (selectedDays, { from, to, selected }) => {
  if (!isValidDay(from) || !isValidDay(to)) {
    return selectedDays;
  }
  const days = getDaysInRange(from, to);
  return selected
    ? addDays(selectedDays, days)
    : removeDays(selectedDays, days);
};

const getDefaultState = () => ({
  selectedDays: [],
  layout: PLANNER_LAYOUT.CONTINUOUS,
  monthsShown: DEFAULT_MONTHS_SHOWN,
  anchorMonth: getCurrentMonth(),
});

export const selection = createSlice({
  name: 'selection',
  initialState: getDefaultState,
  reducers: {
    toggleDay: (state, { payload: day }) => {
      if (!isValidDay(day)) {
        return;
      }
      state.selectedDays = state.selectedDays.includes(day)
        ? removeDays(state.selectedDays, [day])
        : addDays(state.selectedDays, [day]);
    },
    setDaysSelected: (state, { payload }) => {
      state.selectedDays = applyDaysSelected(state.selectedDays, payload);
    },
    toggleMonth: (state, { payload: month }) => {
      if (!isValidMonth(month)) {
        return;
      }
      const days = getDaysInMonth(month);
      const selected = new Set(state.selectedDays);
      const allSelected = days.every((day) => selected.has(day));
      state.selectedDays = allSelected
        ? removeDays(state.selectedDays, days)
        : addDays(state.selectedDays, days);
    },
    clearSelection: (state) => {
      state.selectedDays = [];
    },
    // Picking a month count switches to the month cards layout.
    setMonthsShown: (state, { payload }) => {
      if (MONTHS_SHOWN_OPTIONS.includes(payload)) {
        state.monthsShown = payload;
        state.layout = PLANNER_LAYOUT.MONTHS;
      }
    },
    setLayout: (state, { payload }) => {
      if (PLANNER_LAYOUTS.includes(payload)) {
        state.layout = payload;
      }
    },
    setAnchorMonth: (state, { payload }) => {
      if (isValidMonth(payload)) {
        state.anchorMonth = payload;
      }
    },
    changeAnchorMonth: (state, { payload: delta }) => {
      if (!Number.isInteger(delta)) {
        return;
      }
      state.anchorMonth = dayjs(`${state.anchorMonth}-01`)
        .add(delta, 'month')
        .format(MONTH_FORMAT);
    },
  },
});

export const { setAnchorMonth, changeAnchorMonth } = selection.actions;

export const selectSelectedDays = (state) => state.selection.selectedDays;
export const selectMonthsShown = (state) => state.selection.monthsShown;
export const selectLayout = (state) => state.selection.layout;
export const selectAnchorMonth = (state) => state.selection.anchorMonth;

export const selectSelectedDaySet = createSelector(
  [selectSelectedDays],
  (selectedDays) => new Set(selectedDays)
);

// Persisted fields only; anchorMonth always starts at the current month.
const persistSelection = (state) => {
  updateConfig({
    selectedDays: selectSelectedDays(state),
    layout: selectLayout(state),
    monthsShown: selectMonthsShown(state),
  });
};

const withPersistence =
  (actionCreator) => (payload) => (dispatch, getState) => {
    dispatch(actionCreator(payload));
    persistSelection(getState());
  };

// Public action API: thunks that update the store and persist to
// localStorage, mirroring how viewState persists settings.
export const toggleDay = withPersistence(selection.actions.toggleDay);
export const setDaysSelected = withPersistence(
  selection.actions.setDaysSelected
);
export const toggleMonth = withPersistence(selection.actions.toggleMonth);
export const clearSelection = withPersistence(selection.actions.clearSelection);
export const setMonthsShown = withPersistence(selection.actions.setMonthsShown);
export const setLayout = withPersistence(selection.actions.setLayout);

// Configs saved before layouts existed always carry monthsShown (it was
// persisted with every selection change): those users keep their month
// cards. Without any planner config (a new user) the continuous layout is
// the default.
const getStoredLayout = (config) => {
  if (PLANNER_LAYOUTS.includes(config.layout)) {
    return config.layout;
  }
  return MONTHS_SHOWN_OPTIONS.includes(config.monthsShown)
    ? PLANNER_LAYOUT.MONTHS
    : PLANNER_LAYOUT.CONTINUOUS;
};

export const getSelectionState = () => {
  const config = getConfig() ?? {};
  const defaults = getDefaultState();
  return {
    ...defaults,
    selectedDays: Array.isArray(config.selectedDays)
      ? normalizeDays(config.selectedDays)
      : defaults.selectedDays,
    layout: getStoredLayout(config),
    monthsShown: MONTHS_SHOWN_OPTIONS.includes(config.monthsShown)
      ? config.monthsShown
      : defaults.monthsShown,
  };
};

// Same event source as the range views: events of the selected calendar
// (all-day events are already dropped when loading), null while loading.
const selectSelectedCalendarEvents = (state) =>
  selectCalendarEvents(state, selectSelectedCalendar(state));

const EMPTY_HOURS_BY_DAY = Object.freeze({});

// Map of 'YYYY-MM-DD' (local time) -> unrounded hours. Events are split at
// local midnight, so DST days are 23h/25h long. Overlapping events are summed,
// same as the range views.
export const selectHoursByDay = createSelector(
  [selectSelectedCalendarEvents],
  (events) => {
    if (!events) {
      return EMPTY_HOURS_BY_DAY;
    }

    const hoursByDay = {};

    events.forEach(({ start, end }) => {
      const eventEnd = dayjs(end);
      let cursor = dayjs(start);

      while (cursor.isBefore(eventEnd)) {
        const nextMidnight = cursor.startOf('day').add(1, 'day');
        const segmentEnd = nextMidnight.isBefore(eventEnd)
          ? nextMidnight
          : eventEnd;
        if (!segmentEnd.isAfter(cursor)) {
          // Defensive: never loop forever on odd tz data.
          break;
        }
        const day = cursor.format(DAY_FORMAT);
        hoursByDay[day] =
          (hoursByDay[day] ?? 0) + segmentEnd.diff(cursor) / MS_PER_HOUR;
        cursor = segmentEnd;
      }
    });

    return hoursByDay;
  }
);

// Day count and hours of sorted 'YYYY-MM-DD' days, in total and per month.
export const summarizeSelection = (selectedDays, hoursByDay) => {
  let totalHours = 0;
  const byMonth = [];

  selectedDays.forEach((day) => {
    const month = day.slice(0, MONTH_FORMAT.length);
    const hours = hoursByDay[day] ?? 0;
    let monthEntry = byMonth[byMonth.length - 1];
    if (monthEntry?.month !== month) {
      monthEntry = { month, dayCount: 0, hours: 0 };
      byMonth.push(monthEntry);
    }
    monthEntry.dayCount += 1;
    monthEntry.hours += hours;
    totalHours += hours;
  });

  return {
    dayCount: selectedDays.length,
    totalHours: roundHours(totalHours),
    byMonth: byMonth.map((entry) => ({
      ...entry,
      hours: roundHours(entry.hours),
    })),
  };
};

export const selectSelectionSummary = createSelector(
  [selectSelectedDays, selectHoursByDay],
  summarizeSelection
);

export default selection.reducer;
