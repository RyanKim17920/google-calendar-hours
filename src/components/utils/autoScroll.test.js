import {
  AUTO_SCROLL_EDGE_PX,
  AUTO_SCROLL_MAX_SPEED,
  getAutoScrollSpeed,
} from './autoScroll';

const band = { top: 100, bottom: 800 };

describe('getAutoScrollSpeed', () => {
  it('uses a 60px edge and a positive max speed by default', () => {
    expect(AUTO_SCROLL_EDGE_PX).toBe(60);
    expect(AUTO_SCROLL_MAX_SPEED).toBeGreaterThan(0);
  });

  it('does not scroll away from the edges', () => {
    expect(getAutoScrollSpeed(450, band)).toBe(0);
    // Exactly at the edge distance is still outside the zone.
    expect(getAutoScrollSpeed(160, band)).toBe(0);
    expect(getAutoScrollSpeed(740, band)).toBe(0);
  });

  it('scrolls down near the bottom, faster the closer the pointer', () => {
    const far = getAutoScrollSpeed(745, band);
    const mid = getAutoScrollSpeed(770, band);
    const near = getAutoScrollSpeed(795, band);

    expect(far).toBeGreaterThan(0);
    expect(mid).toBeGreaterThan(far);
    expect(near).toBeGreaterThan(mid);
    expect(mid).toBe(Math.round(AUTO_SCROLL_MAX_SPEED / 2));
  });

  it('scrolls up near the top, mirroring the bottom', () => {
    expect(getAutoScrollSpeed(130, band)).toBe(-getAutoScrollSpeed(770, band));
    expect(getAutoScrollSpeed(101, band)).toBeLessThan(
      getAutoScrollSpeed(150, band)
    );
  });

  it('caps the speed at and beyond the edge', () => {
    expect(getAutoScrollSpeed(800, band)).toBe(AUTO_SCROLL_MAX_SPEED);
    expect(getAutoScrollSpeed(5000, band)).toBe(AUTO_SCROLL_MAX_SPEED);
    expect(getAutoScrollSpeed(100, band)).toBe(-AUTO_SCROLL_MAX_SPEED);
    // Above the band, e.g. over the sticky total bar or out of the window.
    expect(getAutoScrollSpeed(20, band)).toBe(-AUTO_SCROLL_MAX_SPEED);
    expect(getAutoScrollSpeed(-300, band)).toBe(-AUTO_SCROLL_MAX_SPEED);
  });

  it('moves at least 1px per frame inside a zone', () => {
    expect(getAutoScrollSpeed(740.5, band)).toBe(1);
  });

  it('honors custom edge and max speed', () => {
    const options = { ...band, edge: 100, maxSpeed: 10 };
    expect(getAutoScrollSpeed(750, options)).toBe(5);
    expect(getAutoScrollSpeed(650, options)).toBe(0);
  });

  it('splits a band shorter than two edges evenly', () => {
    const short = { top: 0, bottom: 80 };
    expect(getAutoScrollSpeed(40, short)).toBe(0);
    expect(getAutoScrollSpeed(10, short)).toBeLessThan(0);
    expect(getAutoScrollSpeed(70, short)).toBeGreaterThan(0);
  });

  it.each([
    [NaN, band],
    [undefined, band],
    [400, { top: 500, bottom: 500 }],
    [400, { top: 600, bottom: 500 }],
    [400, { top: undefined, bottom: 500 }],
  ])('returns 0 for invalid input (y %p, band %p)', (clientY, options) => {
    expect(getAutoScrollSpeed(clientY, options)).toBe(0);
  });
});
