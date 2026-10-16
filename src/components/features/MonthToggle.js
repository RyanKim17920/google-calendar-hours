import { Fragment, useMemo } from 'react';
import { useDispatch } from 'react-redux';
import cx from 'classnames';
import dayjs from 'dayjs';

import { toggleMonth } from '../stores/selection';
import { getMonthDays } from '../utils/calendarGrid';
import roundHours from '../utils/roundHours';
import { formatHoursLabel } from './DayCell';

import styles from './MonthPlanner.module.css';

// Checkbox-like button that selects or deselects a whole month and shows its
// hours: the month card header, or (compact) the month label of the
// continuous layout. isDaySelected includes the drag preview.
// eslint-disable-next-line react/prop-types
const MonthToggle = ({ month, hoursByDay, isDaySelected, compact = false }) => {
  const dispatch = useDispatch();
  const days = useMemo(() => getMonthDays(month), [month]);
  const monthHours = roundHours(
    days.reduce((sum, day) => sum + (hoursByDay[day] ?? 0), 0)
  );
  const first = dayjs(`${month}-01`);
  const monthName = first.format('MMMM YYYY');
  const selectedCount = days.filter(isDaySelected).length;
  let pressed = 'false';
  if (selectedCount === days.length) {
    pressed = 'true';
  } else if (selectedCount > 0) {
    pressed = 'mixed';
  }

  const check = (
    <span
      className={cx(styles.monthCheck, {
        [styles.monthCheckAll]: pressed === 'true',
        [styles.monthCheckSome]: pressed === 'mixed',
      })}
      aria-hidden="true"
    />
  );

  return (
    <button
      type="button"
      className={compact ? styles.monthLabel : styles.monthHeader}
      title="Select or deselect the whole month"
      aria-label={`Toggle all days of ${monthName}, ${formatHoursLabel(
        monthHours
      )}`}
      aria-pressed={pressed}
      data-month-toggle={month}
      onClick={() => dispatch(toggleMonth(month))}
    >
      {compact ? (
        <Fragment>
          <span className={styles.monthTitle}>
            {check}
            <span className={styles.monthName}>{first.format('MMM')}</span>
          </span>
          <span className={styles.monthYear}>{first.format('YYYY')}</span>
          <span className={styles.monthHours}>{`${monthHours} h`}</span>
        </Fragment>
      ) : (
        <Fragment>
          <span className={styles.monthTitle}>
            {check}
            <span className={styles.monthName}>{monthName}</span>
          </span>
          <span className={styles.monthHours}>{`${monthHours} h`}</span>
        </Fragment>
      )}
    </button>
  );
};

export default MonthToggle;
