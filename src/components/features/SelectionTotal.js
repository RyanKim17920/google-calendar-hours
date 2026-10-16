import { useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import cx from 'classnames';
import dayjs from 'dayjs';

import {
  clearSelection,
  selectHoursByDay,
  selectSelectedDays,
  summarizeSelection,
} from '../stores/selection';

import styles from './SelectionTotal.module.css';

const formatMonth = (month) => dayjs(`${month}-01`).format('MMM YYYY');

// previewDays: the selection while a drag is in progress (not committed to
// the store yet), so the total reflects the drag live; null otherwise.
// eslint-disable-next-line react/prop-types
const SelectionTotal = ({ previewDays = null }) => {
  const dispatch = useDispatch();
  const selectedDays = useSelector(selectSelectedDays);
  const hoursByDay = useSelector(selectHoursByDay);
  const isPreview = previewDays !== null;
  const { dayCount, totalHours, byMonth } = useMemo(
    () => summarizeSelection(previewDays ?? selectedDays, hoursByDay),
    [previewDays, selectedDays, hoursByDay]
  );

  return (
    <div data-testid="SelectionTotal" className={styles.selectionTotal}>
      <div className={styles.row}>
        <div
          className={cx(styles.total, { [styles.totalPreview]: isPreview })}
          data-preview={isPreview}
          // Announce committed totals only, not every step of a drag.
          aria-live={isPreview ? 'off' : 'polite'}
        >
          {`${dayCount} ${dayCount === 1 ? 'day' : 'days'} · ${totalHours} h`}
        </div>
        <button
          type="button"
          className={cx('btn', 'btn-sm', 'btn-outline-secondary')}
          disabled={selectedDays.length === 0}
          onClick={() => dispatch(clearSelection())}
        >
          Clear
        </button>
      </div>
      {/* The row always takes space so the grid doesn't jump on the first
          selection. */}
      <div className={styles.chipRow}>
        {byMonth.length > 0 ? (
          <ul className={styles.chips} aria-label="Selected days per month">
            {byMonth.map(({ month, dayCount: days, hours }) => (
              <li key={month} className={cx('badge', styles.chip)}>
                {`${formatMonth(month)}: ${days} d · ${hours} h`}
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.hint}>Click or drag days to select</p>
        )}
      </div>
    </div>
  );
};

export default SelectionTotal;
