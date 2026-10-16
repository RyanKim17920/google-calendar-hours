import { useSelector, useDispatch } from 'react-redux';
import cx from 'classnames';

import { selectView, changeView } from '../stores/viewState';
import { VIEW } from '../constants';

const VIEW_OPTIONS = [
  { value: VIEW.HOURS, label: 'Hours' },
  { value: VIEW.PLANNER, label: 'Planner' },
];

const ViewToggle = () => {
  const dispatch = useDispatch();
  const view = useSelector(selectView);

  return (
    <div
      data-testid="ViewToggle"
      className={cx('btn-group', 'btn-group-sm')}
      role="group"
      aria-label="View"
    >
      {VIEW_OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          className={cx('btn', 'btn-outline-secondary', {
            active: view === value,
          })}
          aria-pressed={view === value}
          onClick={() => dispatch(changeView(value))}
        >
          {label}
        </button>
      ))}
    </div>
  );
};

export default ViewToggle;
