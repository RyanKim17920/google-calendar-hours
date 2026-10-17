import timekeeper from 'timekeeper';

import createStore from './index';
import reducer, {
  selection,
  toggleDay,
  setDaysSelected,
  toggleMonth,
  clearSelection,
  setMonthsShown,
  setAnchorMonth,
  changeAnchorMonth,
  getSelectionState,
  selectSelectedDays,
  selectMonthsShown,
  selectAnchorMonth,
  selectSelectedDaySet,
} from './selection';

const raw = selection.actions;

const stateWith = (selectedDays = [], rest = {}) => ({
  selectedDays,
  monthsShown: 1,
  anchorMonth: '2026-10',
  ...rest,
});

const readConfig = () => JSON.parse(window.localStorage.getItem('config'));

beforeEach(() => {
  timekeeper.freeze(new Date('2026-10-16T10:00:00Z'));
  window.localStorage.clear();
});

afterEach(() => {
  timekeeper.reset();
});

describe('initial state', () => {
  it('defaults to no days, one month, current month as anchor', () => {
    expect(reducer(undefined, { type: '@@INIT' })).toEqual({
      selectedDays: [],
      monthsShown: 1,
      anchorMonth: '2026-10',
    });
  });
});

describe('toggleDay', () => {
  it('selects an unselected day', () => {
    expect(
      reducer(stateWith(), raw.toggleDay('2026-10-05')).selectedDays
    ).toEqual(['2026-10-05']);
  });

  it('deselects a selected day', () => {
    expect(
      reducer(
        stateWith(['2026-10-05', '2026-10-06']),
        raw.toggleDay('2026-10-05')
      ).selectedDays
    ).toEqual(['2026-10-06']);
  });

  it('keeps days sorted when inserting out of order', () => {
    let state = stateWith();
    ['2026-10-09', '2025-12-31', '2026-10-01'].forEach((day) => {
      state = reducer(state, raw.toggleDay(day));
    });
    expect(state.selectedDays).toEqual([
      '2025-12-31',
      '2026-10-01',
      '2026-10-09',
    ]);
  });

  it.each([
    ['2026-02-31'],
    ['2026-1-5'],
    ['not-a-day'],
    [undefined],
    [20261005],
  ])('ignores invalid day %p', (day) => {
    const state = stateWith(['2026-10-05']);
    expect(reducer(state, raw.toggleDay(day))).toBe(state);
  });
});

describe('setDaysSelected', () => {
  it('selects an inclusive forward range', () => {
    expect(
      reducer(
        stateWith(),
        raw.setDaysSelected({
          from: '2026-10-30',
          to: '2026-11-02',
          selected: true,
        })
      ).selectedDays
    ).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  });

  it('selects an inclusive backward range', () => {
    expect(
      reducer(
        stateWith(),
        raw.setDaysSelected({
          from: '2026-11-02',
          to: '2026-10-30',
          selected: true,
        })
      ).selectedDays
    ).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  });

  it('selects a single day when from equals to', () => {
    expect(
      reducer(
        stateWith(),
        raw.setDaysSelected({
          from: '2026-10-05',
          to: '2026-10-05',
          selected: true,
        })
      ).selectedDays
    ).toEqual(['2026-10-05']);
  });

  it('merges with existing selection without duplicates', () => {
    expect(
      reducer(
        stateWith(['2026-10-01', '2026-10-03', '2026-10-10']),
        raw.setDaysSelected({
          from: '2026-10-02',
          to: '2026-10-04',
          selected: true,
        })
      ).selectedDays
    ).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
      '2026-10-10',
    ]);
  });

  it('deselects a range and leaves days outside it', () => {
    expect(
      reducer(
        stateWith(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']),
        raw.setDaysSelected({
          from: '2026-10-03',
          to: '2026-10-02',
          selected: false,
        })
      ).selectedDays
    ).toEqual(['2026-10-01', '2026-10-04']);
  });

  it.each([
    ['2026-03-28', '2026-03-30'],
    ['2026-10-24', '2026-10-26'],
  ])('includes every day across a DST change (%s..%s)', (from, to) => {
    expect(
      reducer(stateWith(), raw.setDaysSelected({ from, to, selected: true }))
        .selectedDays
    ).toHaveLength(3);
  });

  it('spans a year boundary', () => {
    expect(
      reducer(
        stateWith(),
        raw.setDaysSelected({
          from: '2026-12-31',
          to: '2027-01-01',
          selected: true,
        })
      ).selectedDays
    ).toEqual(['2026-12-31', '2027-01-01']);
  });

  it('ignores invalid bounds', () => {
    const state = stateWith(['2026-10-05']);
    expect(
      reducer(
        state,
        raw.setDaysSelected({ from: 'x', to: '2026-10-07', selected: true })
      )
    ).toBe(state);
  });
});

describe('toggleMonth', () => {
  it('goes empty -> full -> empty', () => {
    let state = reducer(stateWith(), raw.toggleMonth('2026-02'));
    expect(state.selectedDays).toHaveLength(28);
    expect(state.selectedDays[0]).toBe('2026-02-01');
    expect(state.selectedDays[27]).toBe('2026-02-28');
    state = reducer(state, raw.toggleMonth('2026-02'));
    expect(state.selectedDays).toEqual([]);
  });

  it('fills a partially selected month, then clears it', () => {
    let state = reducer(
      stateWith(['2026-01-31', '2026-03-05', '2026-03-20', '2026-04-01']),
      raw.toggleMonth('2026-03')
    );
    expect(state.selectedDays).toHaveLength(31 + 2);
    expect(state.selectedDays[0]).toBe('2026-01-31');
    expect(state.selectedDays[state.selectedDays.length - 1]).toBe(
      '2026-04-01'
    );
    state = reducer(state, raw.toggleMonth('2026-03'));
    expect(state.selectedDays).toEqual(['2026-01-31', '2026-04-01']);
  });

  it('handles leap years', () => {
    expect(
      reducer(stateWith(), raw.toggleMonth('2028-02')).selectedDays
    ).toHaveLength(29);
  });

  it('ignores an invalid month', () => {
    const state = stateWith();
    expect(reducer(state, raw.toggleMonth('2026-13'))).toBe(state);
  });
});

describe('other reducers', () => {
  it('clearSelection empties the selection', () => {
    expect(
      reducer(stateWith(['2026-10-01', '2026-10-02']), raw.clearSelection())
        .selectedDays
    ).toEqual([]);
  });

  it.each([1, 3, 12])('setMonthsShown accepts %p', (n) => {
    expect(reducer(stateWith(), raw.setMonthsShown(n)).monthsShown).toBe(n);
  });

  it.each([0, 2, '3', null])('setMonthsShown rejects %p', (n) => {
    expect(reducer(stateWith(), raw.setMonthsShown(n)).monthsShown).toBe(1);
  });

  it('changeAnchorMonth moves across year boundaries', () => {
    expect(reducer(stateWith(), changeAnchorMonth(3)).anchorMonth).toBe(
      '2027-01'
    );
    expect(reducer(stateWith(), changeAnchorMonth(-10)).anchorMonth).toBe(
      '2025-12'
    );
    expect(reducer(stateWith(), changeAnchorMonth(1.5)).anchorMonth).toBe(
      '2026-10'
    );
  });

  it('setAnchorMonth sets a valid month and ignores invalid ones', () => {
    expect(reducer(stateWith(), setAnchorMonth('2024-02')).anchorMonth).toBe(
      '2024-02'
    );
    expect(reducer(stateWith(), setAnchorMonth('2024-2')).anchorMonth).toBe(
      '2026-10'
    );
  });
});

describe('store wiring and persistence', () => {
  it('registers the slice in the app store', () => {
    const store = createStore();
    expect(selectSelectedDays(store.getState())).toEqual([]);
    expect(selectMonthsShown(store.getState())).toBe(1);
    expect(selectAnchorMonth(store.getState())).toBe('2026-10');
  });

  it('persists selectedDays and monthsShown, and restores them on init', () => {
    window.localStorage.setItem(
      'config',
      JSON.stringify({ selectedCalendarId: 'keep-me' })
    );
    const store = createStore();
    store.dispatch(toggleDay('2026-10-05'));
    store.dispatch(
      setDaysSelected({ from: '2026-10-07', to: '2026-10-06', selected: true })
    );
    store.dispatch(toggleMonth('2026-09'));
    store.dispatch(toggleMonth('2026-09'));
    store.dispatch(setMonthsShown(3));
    store.dispatch(changeAnchorMonth(2));

    expect(readConfig()).toEqual({
      selectedCalendarId: 'keep-me',
      selectedDays: ['2026-10-05', '2026-10-06', '2026-10-07'],
      monthsShown: 3,
    });

    const reloaded = createStore();
    expect(reloaded.getState().selection).toEqual({
      selectedDays: ['2026-10-05', '2026-10-06', '2026-10-07'],
      monthsShown: 3,
      // anchorMonth is not persisted
      anchorMonth: '2026-10',
    });
  });

  it('persists clearSelection', () => {
    const store = createStore();
    store.dispatch(toggleDay('2026-10-05'));
    store.dispatch(clearSelection());
    expect(readConfig().selectedDays).toEqual([]);
  });

  it('sanitizes stored values on load', () => {
    window.localStorage.setItem(
      'config',
      JSON.stringify({
        selectedDays: ['2026-10-05', 'bad', '2026-10-01', '2026-10-05', 7],
        monthsShown: 5,
      })
    );
    expect(getSelectionState()).toEqual({
      selectedDays: ['2026-10-01', '2026-10-05'],
      monthsShown: 1,
      anchorMonth: '2026-10',
    });
  });

  it('falls back to defaults for a non-array selectedDays or corrupt config', () => {
    window.localStorage.setItem(
      'config',
      JSON.stringify({ selectedDays: 'x', monthsShown: 12 })
    );
    expect(getSelectionState()).toEqual({
      selectedDays: [],
      monthsShown: 12,
      anchorMonth: '2026-10',
    });
    window.localStorage.setItem('config', '{not json');
    expect(getSelectionState().selectedDays).toEqual([]);
  });
});

describe('selectSelectedDaySet', () => {
  it('returns a memoized Set of the selected days', () => {
    const state = { selection: stateWith(['2026-10-01', '2026-10-02']) };
    const set = selectSelectedDaySet(state);
    expect(set.has('2026-10-02')).toBe(true);
    expect(set.size).toBe(2);
    expect(selectSelectedDaySet({ selection: { ...state.selection } })).toBe(
      set
    );
  });
});
