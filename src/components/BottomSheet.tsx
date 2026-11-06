'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode, type Ref, type TouchEvent } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';

/**
 * Phone-only panel that rises from just above the bottom navigation bar and
 * holds the same content as the desktop sidebar. It opens at half height so
 * the map stays in view, expands to three quarters on request (handle tap,
 * chevron, or a pull up), and closes by its X button, the Escape key, or a
 * pull down on the handle (a pull down on an expanded sheet first collapses it).
 */
export type SheetSize = 'half' | 'full';

export interface BottomSheetProps {
  /** Accessible name of the panel, e.g. "Facility details". */
  label: string;
  onClose: () => void;
  children: ReactNode;
  /** Height to open at; `half` keeps the map visible above. */
  initialSize?: SheetSize;
  /** The panel element, for measuring its height. */
  ref?: Ref<HTMLElement>;
  /** The scrolling body, for resetting its scroll position. */
  bodyRef?: Ref<HTMLDivElement>;
  /**
   * Where keyboard focus goes when the sheet closes and the element that
   * opened it is gone (for example the active bottom navigation tab).
   */
  returnFocus?: () => HTMLElement | null;
}

/** Drag distances (px) on the handle that count as a pull down or a pull up. */
const PULL_DOWN_PX = 80;
const PULL_UP_PX = 60;

/**
 * Sheet heights. Capped so the handle row always clears the search cluster
 * (top-4 + search box + chips = 120px, plus a gutter) above the 64px nav bar,
 * even on short phones where 75vh alone would reach up under the chips.
 */
const SIZE_CLASS: Record<SheetSize, string> = {
  half: 'max-h-[min(50vh,calc(100dvh-12rem))]',
  full: 'max-h-[min(75vh,calc(100dvh-12rem))]',
};

/** 44px targets, as the handle row is a touch surface. */
const HANDLE_BUTTON =
  'flex h-11 w-11 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100';

export default function BottomSheet({
  label,
  onClose,
  children,
  initialSize = 'half',
  ref,
  bodyRef,
  returnFocus,
}: BottomSheetProps) {
  const [size, setSize] = useState<SheetSize>(initialSize);
  const dragStartY = useRef<number | null>(null);
  const dragged = useRef(false);
  const sectionRef = useRef<HTMLElement | null>(null);

  // The section is needed here (focus) and by the parent (measuring).
  const setSection = useCallback(
    (node: HTMLElement | null) => {
      sectionRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  // Keyboard and screen-reader users: focus moves into the sheet when it
  // opens and, when it closes, back to where it came from or to the nav bar.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    sectionRef.current?.focus({ preventScroll: true });
    return () => {
      // Deferred, so a sheet replacing this one can claim focus first.
      queueMicrotask(() => {
        if (document.activeElement !== document.body) return;
        const target = opener && opener !== document.body && opener.isConnected ? opener : returnFocus?.();
        target?.focus({ preventScroll: true });
      });
    };
  }, [returnFocus]);

  // Escape closes the sheet when pressed with nothing focused; keystrokes
  // from inside the sheet are handled on the section itself, and those from
  // other layers (the search box, the HMO & Plan popover) are left to them.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && event.target === document.body) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const toggleSize = () => setSize((current) => (current === 'half' ? 'full' : 'half'));

  // The sheet follows a downward pull on the handle (plain DOM writes, no
  // re-renders); what happens on release depends on how far it went.
  function sheetOf(event: TouchEvent<HTMLDivElement>): HTMLElement | null {
    return event.currentTarget.parentElement;
  }

  function onTouchStart(event: TouchEvent<HTMLDivElement>) {
    dragStartY.current = event.touches[0]?.clientY ?? null;
    dragged.current = false;
  }

  function onTouchMove(event: TouchEvent<HTMLDivElement>) {
    const start = dragStartY.current;
    const y = event.touches[0]?.clientY;
    if (start === null || y === undefined) return;
    const offset = y - start;
    if (Math.abs(offset) > 4) dragged.current = true;
    const sheet = sheetOf(event);
    if (sheet) sheet.style.transform = offset > 0 ? `translateY(${offset}px)` : '';
  }

  function onTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const start = dragStartY.current;
    dragStartY.current = null;
    const sheet = sheetOf(event);
    if (sheet) sheet.style.transform = '';
    const y = event.changedTouches[0]?.clientY;
    if (start === null || y === undefined) return;
    const offset = y - start;
    if (offset > PULL_DOWN_PX) {
      if (size === 'full') setSize('half');
      else onClose();
    } else if (offset < -PULL_UP_PX && size === 'half') {
      setSize('full');
    }
  }

  /** A tap on the handle toggles the size; a completed drag does not. */
  function onHandleClick() {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    toggleSize();
  }

  return (
    <section
      ref={setSection}
      tabIndex={-1}
      aria-label={label}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
      className={`fixed bottom-16 left-0 z-[900] flex w-full flex-col rounded-t-2xl bg-white text-slate-900 shadow-2xl ring-1 ring-slate-900/10 focus:outline-none dark:bg-slate-900 dark:text-slate-100 dark:ring-white/10 md:hidden ${SIZE_CLASS[size]}`}
    >
      {/* Grab handle row: expand/collapse on the left, close on the right. The
          whole row takes the drag; only the handle itself toggles on tap. */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        className="relative flex h-11 shrink-0 touch-none select-none items-start justify-center"
      >
        {/* Pointer-only convenience; the chevron is the accessible control. */}
        <div onClick={onHandleClick} className="flex h-11 w-24 items-start justify-center pt-2">
          <div className="h-1 w-10 rounded-sm bg-slate-300 dark:bg-slate-600" aria-hidden="true" />
        </div>
        <button
          type="button"
          onClick={toggleSize}
          aria-expanded={size === 'full'}
          className={`absolute left-1 top-0 ${HANDLE_BUTTON}`}
        >
          {size === 'full' ? (
            <ChevronDown className="h-5 w-5" aria-hidden="true" />
          ) : (
            <ChevronUp className="h-5 w-5" aria-hidden="true" />
          )}
          <span className="sr-only">{size === 'full' ? 'Show less of this panel' : 'Show more of this panel'}</span>
        </button>
        <button type="button" onClick={onClose} className={`absolute right-1 top-0 ${HANDLE_BUTTON}`}>
          <X className="h-5 w-5" aria-hidden="true" />
          <span className="sr-only">Close panel</span>
        </button>
      </div>
      <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {children}
      </div>
    </section>
  );
}
