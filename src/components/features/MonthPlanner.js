import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import cx from 'classnames';
import dayjs from 'dayjs';

import {
  MONTHS_SHOWN_OPTIONS,
  applyDaysSelected,
  changeAnchorMonth,
  selectAnchorMonth,
  selectHoursByDay,
  selectMonthsShown,
  selectSelectedDays,
  selectSelectedDaySet,
  setAnchorMonth,
  setDaysSelected,
  setMonthsShown,
  toggleDay,
  toggleMonth,
} from '../stores/selection';
import { selectSelectedCalendar, selectWeekStart } from '../stores/viewState';
import {
  selectCalendarEvents,
  selectIsEventsLoading,
} from '../stores/calendarEvents';
import { WEEK_START } from '../constants';
import roundHours from '../utils/roundHours';
import SelectionTotal from './SelectionTotal';
import WeekStart from './WeekStart';

import styles from './MonthPlanner.module.css';

const DAY_FORMAT = 'YYYY-MM-DD';
const MONTH_FORMAT = 'YYYY-MM';
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Hours at which the heat shading of a day reaches full intensity.
const HEAT_FULL_HOURS = 10;
// Minimum intensity of any day with hours, so a short day is still visible.
const HEAT_FLOOR = 0.25;

const getWeekdayNames = (weekStart) =>
  weekStart === WEEK_START.SUNDAY
    ? WEEKDAY_NAMES
    : [...WEEKDAY_NAMES.slice(1), WEEKDAY_NAMES[0]];

const getMonths = (anchorMonth, count) => {
  const first = dayjs(`${anchorMonth}-01`);
  return Array.from({ length: count }, (_, index) =>
    first.add(index, 'month').format(MONTH_FORMAT)
  );
};

// Cells of a month grid: null for leading/trailing out-of-month slots,
// otherwise the 'YYYY-MM-DD' day.
const getMonthCells = (month, weekStart) => {
  const first = dayjs(`${month}-01`);
  const weekStartDay = weekStart === WEEK_START.SUNDAY ? 0 : 1;
  const leading = (first.day() - weekStartDay + 7) % 7;
  const daysInMonth = first.daysInMonth();
  const trailing = (7 - ((leading + daysInMonth) % 7)) % 7;
  return [
    ...Array(leading).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) =>
      first.add(index, 'day').format(DAY_FORMAT)
    ),
    ...Array(trailing).fill(null),
  ];
};

const getDayFromElement = (element) =>
  element?.closest?.('[data-day]')?.getAttribute('data-day') ?? null;

const isInRange = (day, from, to) =>
  from <= to ? day >= from && day <= to : day >= to && day <= from;

// Heat intensity 0..1 of a day: 0 without (rounded) hours, otherwise a square
// root curve from HEAT_FLOOR up to 1, so light days stay distinguishable while
// busy days still saturate. The CSS maps it to a capped tint opacity.
const getHeat = (roundedHours) => {
  if (roundedHours <= 0) {
    return 0;
  }
  const ratio = Math.min(roundedHours / HEAT_FULL_HOURS, 1);
  return HEAT_FLOOR + (1 - HEAT_FLOOR) * Math.sqrt(ratio);
};

const formatHoursLabel = (hours) =>
  `${hours} ${hours === 1 ? 'hour' : 'hours'}`;

// eslint-disable-next-line react/prop-types
const DayCell = ({ day, hours, isSelected, isToday, onClick }) => {
  const rounded = roundHours(hours);
  const date = dayjs(day);
  return (
    <button
      type="button"
      data-day={day}
      className={cx(styles.day, {
        [styles.daySelected]: isSelected,
        [styles.dayToday]: isToday,
        [styles.dayEmpty]: rounded === 0,
      })}
      style={{ '--heat': getHeat(rounded) }}
      aria-pressed={isSelected}
      aria-current={isToday ? 'date' : undefined}
      aria-label={`${date.format('ddd D MMM YYYY')}, ${formatHoursLabel(
        rounded
      )}`}
      onClick={(event) => onClick(event, day)}
    >
      <span className={styles.dayNumber}>{date.date()}</span>
      <span className={styles.dayHours}>{rounded ? `${rounded}h` : ''}</span>
    </button>
  );
};

/* eslint-disable react/prop-types */
const MonthCard = ({
  month,
  weekStart,
  hoursByDay,
  isDaySelected,
  today,
  onDayClick,
}) => {
  /* eslint-enable react/prop-types */
  const dispatch = useDispatch();
  const cells = useMemo(
    () => getMonthCells(month, weekStart),
    [month, weekStart]
  );
  const monthHours = roundHours(
    cells.reduce((sum, day) => sum + (day ? hoursByDay[day] ?? 0 : 0), 0)
  );
  const monthName = dayjs(`${month}-01`).format('MMMM YYYY');

  return (
    <section className={styles.month} aria-label={monthName} data-month={month}>
      <button
        type="button"
        className={styles.monthHeader}
        title="Select or deselect the whole month"
        aria-label={`Toggle all days of ${monthName}, ${formatHoursLabel(
          monthHours
        )}`}
        onClick={() => dispatch(toggleMonth(month))}
      >
        <span className={styles.monthName}>{monthName}</span>
        <span className={styles.monthHours}>{`${monthHours} h`}</span>
      </button>
      <div
        data-testid="Weekdays"
        className={styles.weekdays}
        aria-hidden="true"
      >
        {getWeekdayNames(weekStart).map((name) => (
          <span key={name}>{name}</span>
        ))}
      </div>
      <div className={styles.days}>
        {cells.map((day, index) =>
          day ? (
            <DayCell
              key={day}
              day={day}
              hours={hoursByDay[day] ?? 0}
              isSelected={isDaySelected(day)}
              isToday={day === today}
              onClick={onDayClick}
            />
          ) : (
            // Out-of-month slots are fixed per month, index keys are stable.
            // eslint-disable-next-line react/no-array-index-key
            <span key={`empty-${index}`} className={styles.dayOutside} />
          )
        )}
      </div>
    </section>
  );
};

const MonthPlanner = () => {
  const dispatch = useDispatch();

  const selectedCalendar = useSelector(selectSelectedCalendar);
  const eventsLoading = useSelector(selectIsEventsLoading);
  const events = useSelector((state) =>
    selectCalendarEvents(state, selectedCalendar)
  );
  const hoursByDay = useSelector(selectHoursByDay);
  const selectedDays = useSelector(selectSelectedDays);
  const selectedDaySet = useSelector(selectSelectedDaySet);
  const monthsShown = useSelector(selectMonthsShown);
  const anchorMonth = useSelector(selectAnchorMonth);
  const weekStart = useSelector(selectWeekStart);

  // Drag preview, local until pointerup: { anchor, end, mode, moved,
  // cancelled }. Committing per pointermove would spam the store and
  // localStorage.
  const [drag, setDragState] = useState(null);
  // Mirror for the window listeners, updated synchronously so a pointerup
  // right after a pointermove sees the latest range before React re-renders.
  const dragRef = useRef(null);
  const setDrag = useCallback((next) => {
    dragRef.current = next;
    setDragState(next);
  }, []);
  // Day of the last click/drag end, start of a shift-click range.
  const lastDayRef = useRef(null);
  // A finished (or cancelled) drag is followed by a click on the cell under
  // the pointer; that click must not toggle the day again.
  const suppressClickRef = useRef(false);

  const isDragging = drag !== null;

  useEffect(() => {
    if (!isDragging) {
      return undefined;
    }

    const handlePointerMove = (event) => {
      const { current: active } = dragRef;
      if (!active || active.cancelled) {
        return;
      }
      const day = getDayFromElement(
        document.elementFromPoint(event.clientX, event.clientY)
      );
      if (day && day !== active.end) {
        setDrag({ ...active, end: day, moved: true });
      }
    };

    const finishDrag = (commit) => {
      const { current: active } = dragRef;
      setDrag(null);
      if (!active || !(active.moved || active.cancelled)) {
        // A plain press: the following click event toggles the day.
        return;
      }
      if (commit && !active.cancelled) {
        dispatch(
          setDaysSelected({
            from: active.anchor,
            to: active.end,
            selected: active.mode,
          })
        );
        lastDayRef.current = active.end;
      }
      suppressClickRef.current = true;
      // The click (if any) is dispatched right after pointerup; afterwards a
      // keyboard click must work again.
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    };

    const handlePointerUp = () => finishDrag(true);
    const handlePointerCancel = () => finishDrag(false);
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && dragRef.current) {
        setDrag({ ...dragRef.current, cancelled: true });
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDragging, dispatch, setDrag]);

  const handlePointerDown = (event) => {
    suppressClickRef.current = false;
    // Primary button / first touch only; shift-click is handled on click.
    if (event.button > 0 || event.isPrimary === false || event.shiftKey) {
      return;
    }
    const day = getDayFromElement(event.target);
    if (!day) {
      return;
    }
    setDrag({
      anchor: day,
      end: day,
      mode: !selectedDaySet.has(day),
      moved: false,
      cancelled: false,
    });
  };

  // Handles mouse/touch taps and keyboard (Enter/Space on the button).
  const handleDayClick = (event, day) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (event.shiftKey && lastDayRef.current) {
      dispatch(
        setDaysSelected({ from: lastDayRef.current, to: day, selected: true })
      );
    } else {
      dispatch(toggleDay(day));
    }
    lastDayRef.current = day;
  };

  // Selection as it would be if the active drag were committed now, null
  // without one. Feeds the total bar so it shows the would-be total live.
  const previewDays = useMemo(
    () =>
      drag && !drag.cancelled
        ? applyDaysSelected(selectedDays, {
            from: drag.anchor,
            to: drag.end,
            selected: drag.mode,
          })
        : null,
    [drag, selectedDays]
  );

  const isDaySelected = (day) => {
    if (drag && !drag.cancelled && isInRange(day, drag.anchor, drag.end)) {
      return drag.mode;
    }
    return selectedDaySet.has(day);
  };

  if (!selectedCalendar) {
    return (
      <p className={styles.message}>Please select a calendar to plan days.</p>
    );
  }

  if (eventsLoading || !events) {
    return <p className={styles.message}>Loading events…</p>;
  }

  const today = dayjs().format(DAY_FORMAT);
  const months = getMonths(anchorMonth, monthsShown);

  return (
    <div data-testid="MonthPlanner" className={styles.planner}>
      <SelectionTotal previewDays={previewDays} />
      <div className={styles.controls}>
        <div className="btn-group btn-group-sm" role="group">
          <button
            type="button"
            className="btn btn-outline-secondary"
            aria-label="Previous month"
            onClick={() => dispatch(changeAnchorMonth(-1))}
          >
            Prev
          </button>
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={() =>
              dispatch(setAnchorMonth(dayjs().format(MONTH_FORMAT)))
            }
          >
            Today
          </button>
          <button
            type="button"
            className="btn btn-outline-secondary"
            aria-label="Next month"
            onClick={() => dispatch(changeAnchorMonth(1))}
          >
            Next
          </button>
        </div>
        <div
          className="btn-group btn-group-sm"
          role="group"
          aria-label="Months shown"
        >
          {MONTHS_SHOWN_OPTIONS.map((count) => (
            <button
              key={count}
              type="button"
              className={cx('btn', 'btn-outline-secondary', {
                active: count === monthsShown,
              })}
              aria-pressed={count === monthsShown}
              onClick={() => dispatch(setMonthsShown(count))}
            >
              {`${count} mo`}
            </button>
          ))}
        </div>
        <WeekStart />
      </div>
      {/* Pointer handling is delegated to the grid; each day is a button
          that is also reachable and operable by keyboard. */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        className={cx(styles.grid, {
          [styles.gridSingle]: monthsShown === 1,
        })}
        onPointerDown={handlePointerDown}
      >
        {months.map((month) => (
          <MonthCard
            key={month}
            month={month}
            weekStart={weekStart}
            hoursByDay={hoursByDay}
            isDaySelected={isDaySelected}
            today={today}
            onDayClick={handleDayClick}
          />
        ))}
      </div>
    </div>
  );
};

export default MonthPlanner;
