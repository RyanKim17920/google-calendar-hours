// Distance from the top/bottom edge (px) in which a drag auto-scrolls.
export const AUTO_SCROLL_EDGE_PX = 60;
// Scroll step (px per animation frame) at, or beyond, the edge itself.
export const AUTO_SCROLL_MAX_SPEED = 24;

// Signed scroll step (px per frame) for a drag pointer at clientY in the
// scrollable band top..bottom (viewport coordinates): negative within
// `edge` px of the top, positive within `edge` px of the bottom, 0 in
// between. Grows linearly with proximity and is capped at maxSpeed once the
// pointer reaches or leaves the edge, so dragging out of the window keeps
// scrolling at full speed.
export const getAutoScrollSpeed = (
  clientY,
  { top, bottom, edge = AUTO_SCROLL_EDGE_PX, maxSpeed = AUTO_SCROLL_MAX_SPEED }
) => {
  if (![clientY, top, bottom].every(Number.isFinite) || bottom <= top) {
    return 0;
  }
  // A band too short for two full edge zones splits evenly, so a pointer in
  // the middle never scrolls.
  const zone = Math.min(edge, (bottom - top) / 2);
  if (zone <= 0) {
    return 0;
  }
  const speedFor = (distance) =>
    Math.max(1, Math.round(maxSpeed * Math.min(1, (zone - distance) / zone)));

  const fromTop = clientY - top;
  if (fromTop < zone) {
    return -speedFor(fromTop);
  }
  const fromBottom = bottom - clientY;
  if (fromBottom < zone) {
    return speedFor(fromBottom);
  }
  return 0;
};
