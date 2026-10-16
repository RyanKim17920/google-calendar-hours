import { useCallback, useMemo, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import cx from 'classnames';
import dayjs from 'dayjs';

import {
  MONTHS_SHOWN_OPTIONS,
  PLANNER_LAYOUT,
  changeAnchorMonth,
  selectAnchorMonth,
  selectHoursByDay,
  selectLayout,
  selectMonthsShown,
  selectSelectedDays,
  selectSelectedDaySet,
  setAnchorMonth,
  setLayout,
  setMonthsShown,
} from '../stores/selection';
import { selectSelectedCalendar, selectWeekStart } from '../stores/viewState';
import {
  selectCalendarEvents,
  selectIsEventsLoading,
} from '../stores/calendarEvents';
import {
  DAY_FORMAT,
  MONTH_FORMAT,
  addMonths,
  getMonthCells,
  getWeekdayNames,
} from '../utils/calendarGrid';
import ContinuousMonths, { ContinuousWeekdays } from './ContinuousMonths';
import DayCell from './DayCell';
import MonthToggle from './MonthToggle';
import SelectionTotal from './SelectionTotal';
import useDayDrag from './useDayDrag';
import WeekStart from './WeekStart';

import styles from './MonthPlanner.module.css';

// Grid layout per months shown, so e.g. 3 months don't leave an empty 4th
// column on desktop.
const GRID_CLASS_BY_MONTHS_SHOWN = {
  1: styles.gridOne,
  3: styles.gridThree,
  12: styles.gridTwelve,
};

/* eslint-disable react/prop-types */
const MonthCard = ({
  month,
  weekStart,
  hoursByDay,
  isDaySelected,
  pressDay,
  today,
  onDayClick,
}) => {
  /* eslint-enable react/prop-types */
  const cells = useMemo(
    () => getMonthCells(month, weekStart),
    [month, weekStart]
  );
  const monthName = dayjs(`${month}-01`).format('MMMM YYYY');

  return (
    <section className={styles.month} aria-label={monthName} data-month={month}>
      <MonthToggle
        month={month}
        hoursByDay={hoursByDay}
        isDaySelected={isDaySelected}
      />
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
              isPressing={day === pressDay}
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
  const layout = useSelector(selectLayout);
  const monthsShown = useSelector(selectMonthsShown);
  const anchorMonth = useSelector(selectAnchorMonth);
  const weekStart = useSelector(selectWeekStart);

  const isContinuous = layout === PLANNER_LAYOUT.CONTINUOUS;
  const stickyRef = useRef(null);
  const dragAreaRef = useRef(null);
  const continuousRef = useRef(null);

  // The sticky bar (total, plus the weekday header of the continuous
  // layout) covers the top of the viewport once the page scrolls.
  const getStickyHeight = useCallback(
    () => stickyRef.current?.offsetHeight ?? 0,
    []
  );
  const getStickyBottom = useCallback(
    () => Math.max(0, stickyRef.current?.getBoundingClientRect().bottom ?? 0),
    []
  );

  const {
    pressDay,
    previewDays,
    isDaySelected,
    handlePointerDown,
    handleContextMenu,
    handleDayClick,
  } = useDayDrag({
    selectedDays,
    selectedDaySet,
    areaRef: dragAreaRef,
    getTopEdge: getStickyBottom,
  });

  if (!selectedCalendar) {
    return (
      <p className={styles.message}>Please select a calendar to plan days.</p>
    );
  }

  if (eventsLoading || !events) {
    return <p className={styles.message}>Loading events…</p>;
  }

  const today = dayjs().format(DAY_FORMAT);
  const currentMonth = dayjs().format(MONTH_FORMAT);

  // The continuous stream scrolls by a month; month cards page instead.
  const navigate = (delta) => {
    if (isContinuous) {
      continuousRef.current?.scrollByMonths(delta);
    } else {
      dispatch(changeAnchorMonth(delta));
    }
  };
  const goToToday = () => {
    if (isContinuous) {
      continuousRef.current?.scrollToMonth(currentMonth);
    } else {
      dispatch(setAnchorMonth(currentMonth));
    }
  };

  const months = Array.from({ length: monthsShown }, (_, index) =>
    addMonths(anchorMonth, index)
  );

  return (
    <div data-testid="MonthPlanner" className={styles.planner}>
      <div ref={stickyRef} className={styles.stickyBar}>
        <SelectionTotal previewDays={previewDays} />
        {isContinuous && <ContinuousWeekdays weekStart={weekStart} />}
      </div>
      <div className={styles.controls}>
        <div className="btn-group btn-group-sm" role="group">
          <button
            type="button"
            className="btn btn-outline-secondary"
            aria-label="Previous month"
            onClick={() => navigate(-1)}
          >
            Prev
          </button>
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={goToToday}
          >
            Today
          </button>
          <button
            type="button"
            className="btn btn-outline-secondary"
            aria-label="Next month"
            onClick={() => navigate(1)}
          >
            Next
          </button>
        </div>
        <div
          className="btn-group btn-group-sm"
          role="group"
          aria-label="Planner layout"
        >
          <button
            type="button"
            className={cx('btn', 'btn-outline-secondary', {
              active: isContinuous,
            })}
            aria-pressed={isContinuous}
            onClick={() => dispatch(setLayout(PLANNER_LAYOUT.CONTINUOUS))}
          >
            Continuous
          </button>
          {MONTHS_SHOWN_OPTIONS.map((count) => {
            const isActive = !isContinuous && count === monthsShown;
            return (
              <button
                key={count}
                type="button"
                className={cx('btn', 'btn-outline-secondary', {
                  active: isActive,
                })}
                aria-pressed={isActive}
                onClick={() => dispatch(setMonthsShown(count))}
              >
                {`${count} mo`}
              </button>
            );
          })}
        </div>
        <WeekStart />
      </div>
      {/* Pointer handling is delegated to this area; each day is a button
          that is also reachable and operable by keyboard. */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        ref={dragAreaRef}
        className={styles.dragArea}
        onPointerDown={handlePointerDown}
        onContextMenu={handleContextMenu}
      >
        {isContinuous ? (
          <ContinuousMonths
            ref={continuousRef}
            anchorMonth={anchorMonth}
            weekStart={weekStart}
            hoursByDay={hoursByDay}
            isDaySelected={isDaySelected}
            pressDay={pressDay}
            today={today}
            onDayClick={handleDayClick}
            getStickyHeight={getStickyHeight}
          />
        ) : (
          <div
            className={cx(styles.grid, GRID_CLASS_BY_MONTHS_SHOWN[monthsShown])}
          >
            {months.map((month) => (
              <MonthCard
                key={month}
                month={month}
                weekStart={weekStart}
                hoursByDay={hoursByDay}
                isDaySelected={isDaySelected}
                pressDay={pressDay}
                today={today}
                onDayClick={handleDayClick}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MonthPlanner;
