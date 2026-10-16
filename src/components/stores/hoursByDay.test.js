import timekeeper from 'timekeeper';

import createStore from './index';
import { loadCalendarEvents } from './calendarEvents';
import { fetchCalendarEvents } from './api';
import { setSelectedCalendar } from './viewState';
import { selectHoursByDay, selectSelectionSummary } from './selection';

jest.mock('./api', () => ({
  fetchCalendarEvents: jest.fn(),
  fetchCalendars: jest.fn(),
}));

// These tests assume Europe/Berlin (pinned in the npm test script).
const buildState = ({
  events = [],
  selectedDays = [],
  selectedCalendarId = 'cal',
  loading = false,
  otherCalendarEvents = [],
} = {}) => ({
  viewState: { selectedCalendarId },
  calendarEvents: {
    loading,
    map: { cal: events, other: otherCalendarEvents },
  },
  selection: { selectedDays, monthsShown: 1, anchorMonth: '2026-10' },
});

const event = (start, end, id = `${start}/${end}`) => ({
  id,
  summary: id,
  start,
  end,
});

beforeAll(() => {
  expect(new Date('2026-01-01T00:00:00Z').getTimezoneOffset()).toBe(-60);
});

describe('selectHoursByDay', () => {
  it('counts an event within one day', () => {
    expect(
      selectHoursByDay(
        buildState({
          events: [
            event('2026-10-05T09:00:00+02:00', '2026-10-05T11:30:00+02:00'),
          ],
        })
      )
    ).toEqual({ '2026-10-05': 2.5 });
  });

  it('assigns days by local time, not UTC', () => {
    // 23:30-00:30 UTC on Oct 4/5 is 01:30-02:30 on Oct 5 in Berlin.
    expect(
      selectHoursByDay(
        buildState({
          events: [event('2026-10-04T23:30:00Z', '2026-10-05T00:30:00Z')],
        })
      )
    ).toEqual({ '2026-10-05': 1 });
  });

  it('splits an event spanning local midnight', () => {
    expect(
      selectHoursByDay(
        buildState({
          events: [
            event('2026-10-05T22:00:00+02:00', '2026-10-06T01:15:00+02:00'),
          ],
        })
      )
    ).toEqual({ '2026-10-05': 2, '2026-10-06': 1.25 });
  });

  it('does not create an entry for an event ending exactly at midnight', () => {
    expect(
      selectHoursByDay(
        buildState({
          events: [
            event('2026-10-05T20:00:00+02:00', '2026-10-06T00:00:00+02:00'),
          ],
        })
      )
    ).toEqual({ '2026-10-05': 4 });
  });

  it('splits a multi-day event into full middle days', () => {
    expect(
      selectHoursByDay(
        buildState({
          events: [
            event('2026-10-05T18:00:00+02:00', '2026-10-08T06:00:00+02:00'),
          ],
        })
      )
    ).toEqual({
      '2026-10-05': 6,
      '2026-10-06': 24,
      '2026-10-07': 24,
      '2026-10-08': 6,
    });
  });

  it('treats 2026-03-29 (spring forward) as a 23h day', () => {
    expect(
      selectHoursByDay(
        buildState({
          events: [
            event('2026-03-28T22:00:00+01:00', '2026-03-30T02:00:00+02:00'),
          ],
        })
      )
    ).toEqual({ '2026-03-28': 2, '2026-03-29': 23, '2026-03-30': 2 });
  });

  it('measures real elapsed time across the spring-forward gap', () => {
    // 01:30 CET -> 03:30 CEST is one real hour.
    expect(
      selectHoursByDay(
        buildState({
          events: [
            event('2026-03-29T01:30:00+01:00', '2026-03-29T03:30:00+02:00'),
          ],
        })
      )
    ).toEqual({ '2026-03-29': 1 });
  });

  it('treats 2026-10-25 (fall back) as a 25h day', () => {
    expect(
      selectHoursByDay(
        buildState({
          events: [
            event('2026-10-24T22:00:00+02:00', '2026-10-26T02:00:00+01:00'),
          ],
        })
      )
    ).toEqual({ '2026-10-24': 2, '2026-10-25': 25, '2026-10-26': 2 });
  });

  it('measures real elapsed time across the fall-back overlap', () => {
    // 02:30 CEST -> 02:30 CET is one real hour.
    expect(
      selectHoursByDay(
        buildState({
          events: [
            event('2026-10-25T02:30:00+02:00', '2026-10-25T02:30:00+01:00'),
          ],
        })
      )
    ).toEqual({ '2026-10-25': 1 });
  });

  it('sums overlapping events like the range views do', () => {
    expect(
      selectHoursByDay(
        buildState({
          events: [
            event(
              '2026-10-05T09:00:00+02:00',
              '2026-10-05T11:00:00+02:00',
              'a'
            ),
            event(
              '2026-10-05T10:00:00+02:00',
              '2026-10-05T12:00:00+02:00',
              'b'
            ),
          ],
        })
      )
    ).toEqual({ '2026-10-05': 4 });
  });

  it('ignores zero-length and inverted events', () => {
    expect(
      selectHoursByDay(
        buildState({
          events: [
            event(
              '2026-10-05T09:00:00+02:00',
              '2026-10-05T09:00:00+02:00',
              'a'
            ),
            event(
              '2026-10-05T11:00:00+02:00',
              '2026-10-05T10:00:00+02:00',
              'b'
            ),
          ],
        })
      )
    ).toEqual({});
  });

  it('only counts events of the selected calendar', () => {
    expect(
      selectHoursByDay(
        buildState({
          events: [
            event('2026-10-05T09:00:00+02:00', '2026-10-05T10:00:00+02:00'),
          ],
          otherCalendarEvents: [
            event('2026-10-05T09:00:00+02:00', '2026-10-05T17:00:00+02:00'),
          ],
        })
      )
    ).toEqual({ '2026-10-05': 1 });
  });

  it('returns an empty object without a selected calendar or while loading', () => {
    const events = [
      event('2026-10-05T09:00:00+02:00', '2026-10-05T10:00:00+02:00'),
    ];
    expect(
      selectHoursByDay(buildState({ events, selectedCalendarId: null }))
    ).toEqual({});
    expect(selectHoursByDay(buildState({ events, loading: true }))).toEqual({});
  });

  it('is memoized on the event list', () => {
    const state = buildState({
      events: [event('2026-10-05T09:00:00+02:00', '2026-10-05T10:00:00+02:00')],
    });
    const result = selectHoursByDay(state);
    expect(
      selectHoursByDay({
        ...state,
        selection: { ...state.selection, selectedDays: ['2026-10-05'] },
      })
    ).toBe(result);
  });

  describe('with events loaded from the API', () => {
    beforeEach(() => {
      timekeeper.freeze(new Date('2026-10-16T10:00:00Z'));
      window.localStorage.clear();
    });

    afterEach(() => {
      timekeeper.reset();
    });

    it('excludes all-day events', async () => {
      fetchCalendarEvents.mockResolvedValue([
        {
          id: 'timed',
          summary: 'timed',
          start: { dateTime: '2026-10-05T09:00:00+02:00' },
          end: { dateTime: '2026-10-05T12:00:00+02:00' },
        },
        {
          id: 'all-day',
          summary: 'all-day',
          start: { date: '2026-10-05' },
          end: { date: '2026-10-07' },
        },
      ]);
      const store = createStore();
      store.dispatch(setSelectedCalendar({ calendarId: 'cal' }));
      await store.dispatch(loadCalendarEvents({ calendarId: 'cal' }));

      expect(selectHoursByDay(store.getState())).toEqual({ '2026-10-05': 3 });
    });
  });
});

describe('selectSelectionSummary', () => {
  it('returns zeros for an empty selection', () => {
    expect(selectSelectionSummary(buildState())).toEqual({
      dayCount: 0,
      totalHours: 0,
      byMonth: [],
    });
  });

  it('totals selected days and groups them by month', () => {
    expect(
      selectSelectionSummary(
        buildState({
          events: [
            event('2026-09-30T22:00:00+02:00', '2026-10-01T02:00:00+02:00'),
            event('2026-10-02T09:00:00+02:00', '2026-10-02T10:30:00+02:00'),
            event('2026-11-03T09:00:00+01:00', '2026-11-03T17:00:00+01:00'),
            // not selected
            event('2026-10-20T09:00:00+02:00', '2026-10-20T17:00:00+02:00'),
          ],
          selectedDays: [
            '2026-09-30',
            '2026-10-01',
            '2026-10-02',
            '2026-10-03',
            '2026-11-03',
          ],
        })
      )
    ).toEqual({
      dayCount: 5,
      totalHours: 13.5,
      byMonth: [
        { month: '2026-09', dayCount: 1, hours: 2 },
        // 2026-10-03 has no events but still counts as a selected day
        { month: '2026-10', dayCount: 3, hours: 3.5 },
        { month: '2026-11', dayCount: 1, hours: 8 },
      ],
    });
  });

  it('sums raw hours and rounds once at the end', () => {
    // Three 20-minute events: rounding each day first would give
    // 0.33 * 3 = 0.99 instead of 1.
    expect(
      selectSelectionSummary(
        buildState({
          events: [
            event(
              '2026-10-01T09:00:00+02:00',
              '2026-10-01T09:20:00+02:00',
              'a'
            ),
            event(
              '2026-10-02T09:00:00+02:00',
              '2026-10-02T09:20:00+02:00',
              'b'
            ),
            event(
              '2026-10-03T09:00:00+02:00',
              '2026-10-03T09:20:00+02:00',
              'c'
            ),
          ],
          selectedDays: ['2026-10-01', '2026-10-02', '2026-10-03'],
        })
      )
    ).toEqual({
      dayCount: 3,
      totalHours: 1,
      byMonth: [{ month: '2026-10', dayCount: 3, hours: 1 }],
    });
  });

  it('includes DST days at their real length', () => {
    expect(
      selectSelectionSummary(
        buildState({
          events: [
            event(
              '2026-03-29T00:00:00+01:00',
              '2026-03-30T00:00:00+02:00',
              'a'
            ),
            event(
              '2026-10-25T00:00:00+02:00',
              '2026-10-26T00:00:00+01:00',
              'b'
            ),
          ],
          selectedDays: ['2026-03-29', '2026-10-25'],
        })
      ).totalHours
    ).toBe(48);
  });

  it('is memoized', () => {
    const state = buildState({ selectedDays: ['2026-10-01'] });
    expect(selectSelectionSummary({ ...state })).toBe(
      selectSelectionSummary(state)
    );
  });
});
