import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';

import {
  applyDaysSelected,
  setDaysSelected,
  toggleDay,
} from '../stores/selection';
import { getAutoScrollSpeed } from '../utils/autoScroll';

// A touch selects only after the finger rests this long on a day; before
// that a swipe scrolls the page and a quick tap toggles the day.
export const LONG_PRESS_MS = 300;
// Finger movement (px) that turns a pending long-press into a swipe.
export const LONG_PRESS_SLOP_PX = 10;
// The click that follows a finished drag must not toggle the end day again.
// Clicks of a touch can trail the pointerup by a few frames.
const SUPPRESS_CLICK_MS = 400;

const getDayFromElement = (element) =>
  element?.closest?.('[data-day]')?.getAttribute('data-day') ?? null;

const isInRange = (day, from, to) =>
  from <= to ? day >= from && day <= to : day >= to && day <= from;

// Click, shift-click, drag (mouse: immediately; touch: after a long-press)
// and edge auto-scroll for selecting planner days.
//
// areaRef: element containing all day cells, gets a non-passive touchmove
//   listener so an active touch drag doesn't scroll the page.
// getTopEdge: viewport y below which the page content is visible (the
//   bottom of the sticky total bar); the top auto-scroll zone starts there.
const useDayDrag = ({ selectedDays, selectedDaySet, areaRef, getTopEdge }) => {
  const dispatch = useDispatch();

  // Drag preview, local until pointerup: { anchor, end, mode, moved,
  // cancelled }. Committing per pointermove would spam the store and
  // localStorage.
  const [drag, setDragState] = useState(null);
  // Mirror for the window listeners, updated synchronously so a pointerup
  // right after a pointermove sees the latest range before React re-renders.
  const dragRef = useRef(null);
  const setDrag = useCallback((next) => {
    dragRef.current = next;
    setDragState(next);
  }, []);
  // Day of a touch waiting for its long-press, shown as feedback.
  const [pressDay, setPressDay] = useState(null);
  // { day, x, y, timer } of that pending touch.
  const pressRef = useRef(null);
  // Last pointer position of the active drag, probed while auto-scrolling.
  const pointerRef = useRef(null);
  const frameRef = useRef(null);
  // Day of the last click/drag end, start of a shift-click range.
  const lastDayRef = useRef(null);
  const suppressClickRef = useRef(false);
  const getTopEdgeRef = useRef(getTopEdge);
  getTopEdgeRef.current = getTopEdge;

  const isDragging = drag !== null;

  const startDrag = useCallback(
    (day, { moved }) => {
      setDrag({
        anchor: day,
        end: day,
        mode: !selectedDaySet.has(day),
        moved,
        cancelled: false,
      });
    },
    [selectedDaySet, setDrag]
  );

  const clearPress = useCallback(() => {
    if (pressRef.current) {
      clearTimeout(pressRef.current.timer);
      pressRef.current = null;
    }
    setPressDay(null);
  }, []);

  useEffect(() => clearPress, [clearPress]);

  // Pending long-press: any real movement (a swipe that scrolls) or lifting
  // the finger drops it; a lifted finger then clicks, which toggles the day.
  useEffect(() => {
    if (pressDay === null) {
      return undefined;
    }
    const handlePointerMove = (event) => {
      const { current: press } = pressRef;
      if (
        press &&
        Math.hypot(event.clientX - press.x, event.clientY - press.y) >
          LONG_PRESS_SLOP_PX
      ) {
        clearPress();
      }
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', clearPress);
    window.addEventListener('pointercancel', clearPress);
    window.addEventListener('scroll', clearPress, { passive: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', clearPress);
      window.removeEventListener('pointercancel', clearPress);
      window.removeEventListener('scroll', clearPress);
    };
  }, [pressDay, clearPress]);

  useEffect(() => {
    if (!isDragging) {
      return undefined;
    }

    const extendTo = (clientX, clientY) => {
      const { current: active } = dragRef;
      if (!active || active.cancelled) {
        return;
      }
      const day = getDayFromElement(
        document.elementFromPoint(clientX, clientY)
      );
      if (day && day !== active.end) {
        setDrag({ ...active, end: day, moved: true });
      }
    };

    const getSpeed = () => {
      const { current: pointer } = pointerRef;
      if (!pointer) {
        return 0;
      }
      return getAutoScrollSpeed(pointer.y, {
        top: getTopEdgeRef.current?.() ?? 0,
        bottom: window.innerHeight,
      });
    };

    const stopAutoScroll = () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };

    // While the pointer rests near an edge, scroll a step per frame and
    // re-probe the (unmoved) pointer, which now hovers over another day.
    // The probe is clamped into the visible band, so a pointer dragged out
    // of the window keeps extending to the first/last visible row.
    const autoScrollStep = () => {
      frameRef.current = null;
      const { current: active } = dragRef;
      const speed = getSpeed();
      if (!active || active.cancelled || speed === 0) {
        return;
      }
      window.scrollBy(0, speed);
      const { x, y } = pointerRef.current;
      const top = getTopEdgeRef.current?.() ?? 0;
      extendTo(x, Math.min(Math.max(y, top + 1), window.innerHeight - 1));
      frameRef.current = requestAnimationFrame(autoScrollStep);
    };

    const handlePointerMove = (event) => {
      const { current: active } = dragRef;
      if (!active || active.cancelled) {
        return;
      }
      pointerRef.current = { x: event.clientX, y: event.clientY };
      extendTo(event.clientX, event.clientY);
      if (frameRef.current === null && getSpeed() !== 0) {
        frameRef.current = requestAnimationFrame(autoScrollStep);
      }
    };

    const finishDrag = (commit) => {
      const { current: active } = dragRef;
      stopAutoScroll();
      pointerRef.current = null;
      setDrag(null);
      if (!active || !(active.moved || active.cancelled)) {
        // A plain press: the following click event toggles the day.
        return;
      }
      if (commit && !active.cancelled) {
        dispatch(
          setDaysSelected({
            from: active.anchor,
            to: active.end,
            selected: active.mode,
          })
        );
        lastDayRef.current = active.end;
      }
      suppressClickRef.current = true;
      // Afterwards a keyboard click must work again.
      setTimeout(() => {
        suppressClickRef.current = false;
      }, SUPPRESS_CLICK_MS);
    };

    const handlePointerUp = () => finishDrag(true);
    const handlePointerCancel = () => finishDrag(false);
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && dragRef.current) {
        stopAutoScroll();
        setDrag({ ...dragRef.current, cancelled: true });
      }
    };
    // An active touch drag owns the finger: no page scroll (and thus no
    // pointercancel). Auto-scroll takes over near the edges.
    const preventTouchScroll = (event) => {
      if (event.cancelable) {
        event.preventDefault();
      }
    };

    const area = areaRef.current;
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
    window.addEventListener('keydown', handleKeyDown);
    area?.addEventListener('touchmove', preventTouchScroll, {
      passive: false,
    });
    return () => {
      stopAutoScroll();
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
      window.removeEventListener('keydown', handleKeyDown);
      area?.removeEventListener('touchmove', preventTouchScroll);
    };
  }, [isDragging, dispatch, setDrag, areaRef]);

  const handlePointerDown = (event) => {
    suppressClickRef.current = false;
    clearPress();
    // Primary button / first touch only; shift-click is handled on click.
    if (event.button > 0 || event.isPrimary === false || event.shiftKey) {
      return;
    }
    const day = getDayFromElement(event.target);
    if (!day) {
      return;
    }
    if (event.pointerType !== 'touch') {
      startDrag(day, { moved: false });
      return;
    }
    const { clientX: x, clientY: y } = event;
    pressRef.current = {
      day,
      x,
      y,
      timer: setTimeout(() => {
        pressRef.current = null;
        setPressDay(null);
        pointerRef.current = { x, y };
        // Counts as moved: lifting the finger now commits this day, whether
        // or not the browser still sends a click after the long-press.
        startDrag(day, { moved: true });
        navigator.vibrate?.(10);
      }, LONG_PRESS_MS),
    };
    setPressDay(day);
  };

  // Android/iOS show a context menu or callout on a long-press; it would
  // interrupt the touch drag.
  const handleContextMenu = (event) => {
    if (pressRef.current || dragRef.current) {
      event.preventDefault();
    }
  };

  // Handles mouse/touch taps and keyboard (Enter/Space on the button).
  // Stable, so memoized day cells don't re-render for a new handler.
  const handleDayClick = useCallback(
    (event, day) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      if (event.shiftKey && lastDayRef.current) {
        dispatch(
          setDaysSelected({ from: lastDayRef.current, to: day, selected: true })
        );
      } else {
        dispatch(toggleDay(day));
      }
      lastDayRef.current = day;
    },
    [dispatch]
  );

  // Selection as it would be if the active drag were committed now, null
  // without one. Feeds the total bar so it shows the would-be total live.
  const previewDays = useMemo(
    () =>
      drag && !drag.cancelled
        ? applyDaysSelected(selectedDays, {
            from: drag.anchor,
            to: drag.end,
            selected: drag.mode,
          })
        : null,
    [drag, selectedDays]
  );

  const isDaySelected = useCallback(
    (day) => {
      if (drag && !drag.cancelled && isInRange(day, drag.anchor, drag.end)) {
        return drag.mode;
      }
      return selectedDaySet.has(day);
    },
    [drag, selectedDaySet]
  );

  return {
    pressDay,
    previewDays,
    isDaySelected,
    handlePointerDown,
    handleContextMenu,
    handleDayClick,
  };
};

export default useDayDrag;
