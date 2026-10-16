import {
  addMonths,
  getMonthCells,
  getMonthDays,
  getMonthOfDay,
  getWeekdayNames,
  getWeekRows,
} from './calendarGrid';

describe('calendar grid helpers', () => {
  it('orders weekday names by week start', () => {
    expect(getWeekdayNames('monday')).toEqual([
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun',
    ]);
    expect(getWeekdayNames('sunday')[0]).toBe('Sun');
  });

  it('adds months across years and gets the month of a day', () => {
    expect(addMonths('2018-11', 3)).toBe('2019-02');
    expect(addMonths('2018-01', -1)).toBe('2017-12');
    expect(getMonthOfDay('2018-02-28')).toBe('2018-02');
  });

  it('lists the days of a month, leap years included', () => {
    expect(getMonthDays('2020-02')).toHaveLength(29);
    expect(getMonthDays('2018-02').at(-1)).toBe('2018-02-28');
  });

  it('pads month cells to whole weeks', () => {
    // 1 Feb 2018 is a Thursday.
    const cells = getMonthCells('2018-02', 'monday');
    expect(cells.slice(0, 4)).toEqual([null, null, null, '2018-02-01']);
    expect(cells).toHaveLength(35);
  });

  describe('getWeekRows', () => {
    it('streams whole weeks across month boundaries without gaps', () => {
      const rows = getWeekRows('2018-01', '2018-02', 'monday');

      // Mon 1 Jan 2018 .. Sun 4 Mar 2018: 9 full weeks.
      expect(rows).toHaveLength(9);
      expect(rows[0][0]).toBe('2018-01-01');
      rows.forEach((row) => expect(row).toHaveLength(7));
      // The week of 29 Jan holds the first days of February.
      expect(rows[4]).toEqual([
        '2018-01-29',
        '2018-01-30',
        '2018-01-31',
        '2018-02-01',
        '2018-02-02',
        '2018-02-03',
        '2018-02-04',
      ]);
      expect(rows.at(-1).at(-1)).toBe('2018-03-04');
      // Consecutive days, no duplicates or holes.
      const days = rows.flat();
      expect(new Set(days).size).toBe(days.length);
    });

    it('honors a Sunday week start', () => {
      const rows = getWeekRows('2018-01', '2018-01', 'sunday');
      expect(rows[0][0]).toBe('2017-12-31');
      expect(rows[0][1]).toBe('2018-01-01');
      expect(rows.at(-1)).toContain('2018-01-31');
    });

    it('keeps one row per week over DST changes', () => {
      // Berlin switches to summer time on 25 Mar 2018, back on 28 Oct.
      const days = getWeekRows('2018-03', '2018-10', 'monday').flat();
      ['2018-03-25', '2018-03-26', '2018-10-28', '2018-10-29'].forEach((day) =>
        expect(days.filter((d) => d === day)).toHaveLength(1)
      );
      expect(days.length % 7).toBe(0);
    });
  });
});
