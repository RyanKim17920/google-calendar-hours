import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import cx from 'classnames';

import {
  addMonths,
  getMonthOfDay,
  getWeekdayNames,
  getWeekRows,
} from '../utils/calendarGrid';
import DayCell from './DayCell';
import MonthToggle from './MonthToggle';

import styles from './MonthPlanner.module.css';

// Initially rendered months around the anchor month.
export const MONTHS_BEFORE_ANCHOR = 3;
export const MONTHS_AFTER_ANCHOR = 8;
// Months added when scrolling close to either end of the stream.
export const EXTEND_BY_MONTHS = 6;
// Distance (px) from the rendered top/bottom at which the stream extends.
export const EXTEND_THRESHOLD_PX = 600;
// Programmatic jumps (initial position, prepend compensation) pass
// behavior 'instant': Bootstrap sets `scroll-behavior: smooth` on :root,
// which would otherwise animate them and let scroll events read stale
// positions mid-animation.
// Prev/Next clicked within this time step from the month they scrolled to,
// not from the (still smoothly scrolling) position.
const NAV_SETTLE_MS = 700;

// Month shown at the top of the viewport: the last month whose 1st is at or
// above topEdge (viewport y), given the 1st-of-month rows' tops in order. Before
// the first such row it's the first month.
export const getMonthAtTop = (monthStarts, topEdge) => {
  let current = monthStarts[0]?.month ?? null;
  monthStarts.forEach(({ month, top }) => {
    // 2px of slack: a month scrolled to exactly the top edge counts.
    if (top <= topEdge + 2) {
      current = month;
    }
  });
  return current;
};

// Weekday header aligned with the stream's columns, rendered in the sticky
// bar above it.
// eslint-disable-next-line react/prop-types
export const ContinuousWeekdays = ({ weekStart }) => (
  <div
    data-testid="Weekdays"
    className={cx(styles.weekdays, styles.streamColumns)}
    aria-hidden="true"
  >
    <span />
    {getWeekdayNames(weekStart).map((name) => (
      <span key={name}>{name}</span>
    ))}
  </div>
);

// Month parity, so neighbouring months get alternating backgrounds.
const isAltMonth = (day) => Number(day.slice(5, 7)) % 2 === 0;

// One unbroken stream of week rows: weeks spanning two months show both
// months' days, with an alternating background per month, a stepped border
// where the month changes and the month's toggle in the left gutter of the
// row holding its 1st. Grows by EXTEND_BY_MONTHS when scrolled near either
// end; prepending keeps the visible rows in place.
/* eslint-disable react/prop-types */
const ContinuousMonths = forwardRef(
  (
    {
      anchorMonth,
      weekStart,
      hoursByDay,
      isDaySelected,
      pressDay,
      today,
      onDayClick,
      getStickyHeight,
    },
    ref
  ) => {
    /* eslint-enable react/prop-types */
    const [range, setRange] = useState(() => ({
      first: addMonths(anchorMonth, -MONTHS_BEFORE_ANCHOR),
      last: addMonths(anchorMonth, MONTHS_AFTER_ANCHOR),
    }));
    const streamRef = useRef(null);
    // Stream height before a prepend, to restore the scroll position after.
    const heightBeforePrependRef = useRef(null);
    // { month, behavior } to scroll to once it's rendered.
    const pendingScrollRef = useRef({
      month: anchorMonth,
      behavior: 'instant',
    });
    const lastNavRef = useRef(null);

    const rows = useMemo(
      () => getWeekRows(range.first, range.last, weekStart),
      [range, weekStart]
    );

    const getMonthStartRow = (month) =>
      streamRef.current?.querySelector(`[data-week-of="${month}"]`) ?? null;

    const scrollToMonth = useCallback(
      (month, behavior) => {
        const row = getMonthStartRow(month);
        if (!row) {
          return;
        }
        // The sticky bar stays on top after scrolling; land right below it.
        window.scrollBy({
          top: row.getBoundingClientRect().top - getStickyHeight(),
          behavior,
        });
      },
      [getStickyHeight]
    );

    // Scroll to a month, extending the stream first if it isn't rendered.
    const goToMonth = useCallback(
      (month, behavior) => {
        if (month >= range.first && month <= range.last) {
          scrollToMonth(month, behavior);
          return;
        }
        pendingScrollRef.current = { month, behavior };
        setRange(({ first, last }) => ({
          first:
            month < first ? addMonths(month, -MONTHS_BEFORE_ANCHOR) : first,
          last: month > last ? addMonths(month, MONTHS_AFTER_ANCHOR) : last,
        }));
      },
      [range, scrollToMonth]
    );

    useLayoutEffect(() => {
      const stream = streamRef.current;
      if (heightBeforePrependRef.current !== null && stream) {
        window.scrollBy({
          top: stream.offsetHeight - heightBeforePrependRef.current,
          behavior: 'instant',
        });
        heightBeforePrependRef.current = null;
      }
      const { current: pending } = pendingScrollRef;
      if (pending) {
        pendingScrollRef.current = null;
        scrollToMonth(pending.month, pending.behavior);
      }
    }, [rows, scrollToMonth]);

    // Prepending is compensated by hand; the browser's own scroll anchoring
    // would compensate a second time.
    useEffect(() => {
      const { style } = document.documentElement;
      const previous = style.overflowAnchor;
      style.overflowAnchor = 'none';
      return () => {
        style.overflowAnchor = previous;
      };
    }, []);

    useEffect(() => {
      const handleScroll = () => {
        const stream = streamRef.current;
        if (!stream || heightBeforePrependRef.current !== null) {
          return;
        }
        const { top, bottom } = stream.getBoundingClientRect();
        if (bottom < window.innerHeight + EXTEND_THRESHOLD_PX) {
          setRange((current) => ({
            ...current,
            last: addMonths(current.last, EXTEND_BY_MONTHS),
          }));
        } else if (top > -EXTEND_THRESHOLD_PX) {
          heightBeforePrependRef.current = stream.offsetHeight;
          setRange((current) => ({
            ...current,
            first: addMonths(current.first, -EXTEND_BY_MONTHS),
          }));
        }
      };
      window.addEventListener('scroll', handleScroll, { passive: true });
      return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        scrollByMonths: (delta) => {
          const { current: lastNav } = lastNavRef;
          let from = lastNav?.month;
          if (!lastNav || Date.now() - lastNav.at > NAV_SETTLE_MS) {
            const monthStarts = [
              ...(streamRef.current?.querySelectorAll('[data-week-of]') ?? []),
            ].map((row) => ({
              month: row.getAttribute('data-week-of'),
              top: row.getBoundingClientRect().top,
            }));
            from = getMonthAtTop(monthStarts, getStickyHeight()) ?? anchorMonth;
          }
          const month = addMonths(from, delta);
          lastNavRef.current = { month, at: Date.now() };
          goToMonth(month, 'smooth');
        },
        scrollToMonth: (month) => {
          lastNavRef.current = { month, at: Date.now() };
          goToMonth(month, 'smooth');
        },
      }),
      [anchorMonth, getStickyHeight, goToMonth]
    );

    return (
      <div
        ref={streamRef}
        data-testid="ContinuousPlanner"
        className={styles.stream}
        role="group"
        aria-label="Days, continuous"
      >
        {rows.map((days) => {
          const monthStart = days.find((day) => day.endsWith('-01'));
          // Days before the 1st of the first rendered month (top row) belong
          // to a month without a label until the stream extends upwards.
          const startedMonth = monthStart && getMonthOfDay(monthStart);
          return (
            <div
              key={days[0]}
              className={cx(styles.week, styles.streamColumns)}
              data-week-of={startedMonth || undefined}
            >
              <div className={styles.weekGutter}>
                {startedMonth && (
                  <MonthToggle
                    compact
                    month={startedMonth}
                    hoursByDay={hoursByDay}
                    isDaySelected={isDaySelected}
                  />
                )}
              </div>
              {days.map((day, column) => {
                const date = Number(day.slice(-2));
                return (
                  <DayCell
                    key={day}
                    day={day}
                    hours={hoursByDay[day] ?? 0}
                    isSelected={isDaySelected(day)}
                    isToday={day === today}
                    isPressing={day === pressDay}
                    className={cx({
                      [styles.dayAltMonth]: isAltMonth(day),
                      // The row above holds the previous month.
                      [styles.monthEdgeTop]: date <= 7,
                      // The cell to the left holds the previous month.
                      [styles.monthEdgeLeft]: date === 1 && column > 0,
                    })}
                    onClick={onDayClick}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    );
  }
);

ContinuousMonths.displayName = 'ContinuousMonths';

export default ContinuousMonths;
