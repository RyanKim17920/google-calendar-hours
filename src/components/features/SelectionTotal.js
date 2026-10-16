import { useSelector, useDispatch } from 'react-redux';
import cx from 'classnames';
import dayjs from 'dayjs';

import { clearSelection, selectSelectionSummary } from '../stores/selection';

import styles from './SelectionTotal.module.css';

const formatMonth = (month) => dayjs(`${month}-01`).format('MMM YYYY');

const SelectionTotal = () => {
  const dispatch = useDispatch();
  const { dayCount, totalHours, byMonth } = useSelector(selectSelectionSummary);

  return (
    <div data-testid="SelectionTotal" className={styles.selectionTotal}>
      <div className={styles.row}>
        <div className={styles.total} aria-live="polite">
          {`${dayCount} ${dayCount === 1 ? 'day' : 'days'} · ${totalHours} h`}
        </div>
        <button
          type="button"
          className={cx('btn', 'btn-sm', 'btn-outline-secondary')}
          disabled={dayCount === 0}
          onClick={() => dispatch(clearSelection())}
        >
          Clear
        </button>
      </div>
      {byMonth.length > 0 && (
        <ul className={styles.chips} aria-label="Selected days per month">
          {byMonth.map(({ month, dayCount: days, hours }) => (
            <li key={month} className={cx('badge', styles.chip)}>
              {`${formatMonth(month)}: ${days} d · ${hours} h`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default SelectionTotal;
