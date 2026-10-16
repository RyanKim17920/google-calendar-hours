import { memo } from 'react';
import cx from 'classnames';
import dayjs from 'dayjs';

import roundHours from '../utils/roundHours';

import styles from './MonthPlanner.module.css';

// Hours at which the heat shading of a day reaches full intensity.
const HEAT_FULL_HOURS = 10;
// Minimum intensity of any day with hours, so a short day is still visible.
const HEAT_FLOOR = 0.25;

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

export const formatHoursLabel = (hours) =>
  `${hours} ${hours === 1 ? 'hour' : 'hours'}`;

// One day of any planner layout. Memoized: a drag re-renders the planner on
// every step, but only the cells whose selected state changes need to.
/* eslint-disable react/prop-types */
const DayCell = ({
  day,
  hours,
  isSelected,
  isToday,
  isPressing = false,
  className,
  onClick,
}) => {
  /* eslint-enable react/prop-types */
  const rounded = roundHours(hours);
  const date = dayjs(day);
  return (
    <button
      type="button"
      data-day={day}
      className={cx(styles.day, className, {
        [styles.daySelected]: isSelected,
        [styles.dayToday]: isToday,
        [styles.dayEmpty]: rounded === 0,
        [styles.dayPressing]: isPressing,
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

export default memo(DayCell);
