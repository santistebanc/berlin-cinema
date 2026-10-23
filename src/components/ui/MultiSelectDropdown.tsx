import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, X } from 'lucide-react';
import { cn } from '../../utils/cn';

interface Option {
  value: string;
  label: string;
}

interface MultiSelectDropdownProps {
  label: string;
  options: Option[];
  selected: string[];
  onToggle: (value: string) => void;
  onToggleAll: () => void;
  allSelected: boolean;
}

interface Placement {
  top: number;
  left: number;
  maxHeight: number;
}

const TRIGGER_GAP = 4;
const VIEWPORT_MARGIN = 8;
const CLOSED_SHEET = { present: false, visible: false, motion: 'instant' as 'instant' | 'animate' };
// One filter can still be exiting when keyboard navigation opens the next.
let mobileScrollLocks = 0;
let previousBodyOverflow = '';

/** Open below unless the panel only fits (or fits better) above; keep it horizontally inside the viewport. */
function placePanel(trigger: DOMRect, panel: DOMRect): Placement {
  const viewportWidth = document.documentElement.clientWidth;
  const spaceBelow = window.innerHeight - trigger.bottom - TRIGGER_GAP - VIEWPORT_MARGIN;
  const spaceAbove = trigger.top - TRIGGER_GAP - VIEWPORT_MARGIN;
  const openUp = panel.height > spaceBelow && spaceAbove > spaceBelow;
  const maxHeight = Math.max(openUp ? spaceAbove : spaceBelow, 0);
  const height = Math.min(panel.height, maxHeight);

  const overflowsRight = trigger.left + panel.width > viewportWidth - VIEWPORT_MARGIN;
  const preferredLeft = overflowsRight ? trigger.right - panel.width : trigger.left;
  const left = Math.max(VIEWPORT_MARGIN, Math.min(preferredLeft, viewportWidth - VIEWPORT_MARGIN - panel.width));

  return { top: openUp ? trigger.top - TRIGGER_GAP - height : trigger.bottom + TRIGGER_GAP, left, maxHeight };
}

const Checkbox: React.FC<{ checked: boolean }> = ({ checked }) => (
  <span
    className={cn(
      'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border',
      checked
        ? 'border-[rgb(var(--accent-strong))] bg-[rgb(var(--accent-strong))]'
        : 'border-[rgb(var(--border-strong))]'
    )}
  >
    {checked && <Check className="h-2.5 w-2.5 text-white" />}
  </span>
);

const OptionList: React.FC<{
  options: Option[];
  selected: string[];
  allSelected: boolean;
  onToggle: (v: string) => void;
  onToggleAll: () => void;
  mobile?: boolean;
}> = ({ options, selected, allSelected, onToggle, onToggleAll, mobile }) => (
  <>
    <button
      type="button"
      onClick={onToggleAll}
      className={cn(
        'flex w-full items-center gap-2.5 border-b text-left font-medium transition-colors hover:bg-[rgb(var(--surface-muted))]',
        mobile ? 'px-5 py-3.5 text-sm' : 'px-3 py-2 text-xs'
      )}
      style={{ borderColor: 'rgb(var(--border))', color: 'rgb(var(--text-muted))' }}
    >
      <Checkbox checked={allSelected} />
      All
    </button>
    <div className={cn('min-h-0 overflow-y-auto overscroll-contain', mobile ? 'max-h-[60vh]' : 'max-h-56')}>
      {options.map(opt => {
        const checked = selected.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onToggle(opt.value)}
            className={cn(
              'flex w-full items-center gap-2.5 text-left transition-colors hover:bg-[rgb(var(--surface-muted))]',
              mobile ? 'px-5 py-3.5 text-sm' : 'px-3 py-2 text-xs'
            )}
            style={{ color: 'rgb(var(--text))' }}
          >
            <Checkbox checked={checked} />
            {opt.label}
          </button>
        );
      })}
    </div>
  </>
);

const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({
  label,
  options,
  selected,
  onToggle,
  onToggleAll,
  allSelected,
}) => {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [mobileSheet, setMobileSheet] = useState(CLOSED_SHEET);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);

  useLayoutEffect(() => { openRef.current = open; }, [open]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const handler = () => {
      setIsMobile(mq.matches);
      // Switching presentation is immediate, even halfway through an exit.
      const visible = mq.matches && openRef.current;
      setMobileSheet({ present: visible, visible, motion: 'instant' });
    };
    handler();
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (!open || isMobile) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const inTrigger = triggerRef.current?.contains(target);
      const inPanel = panelRef.current?.contains(target);
      if (!inTrigger && !inPanel) setOpen(false);
    };
    const onScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, isMobile]);

  // Measure the hidden panel before paint, then place it where it fits.
  useLayoutEffect(() => {
    if (!open || isMobile) {
      setPlacement(null);
      return;
    }
    if (!triggerRef.current || !panelRef.current) return;
    setPlacement(placePanel(triggerRef.current.getBoundingClientRect(), panelRef.current.getBoundingClientRect()));
  }, [open, isMobile]);

  const mobileLocked = isMobile && (open || mobileSheet.present);
  useLayoutEffect(() => {
    if (!mobileLocked) return;
    if (mobileScrollLocks++ === 0) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    return () => {
      if (--mobileScrollLocks === 0) document.body.style.overflow = previousBodyOverflow;
    };
  }, [mobileLocked]);

  const changeMobileOpen = (nextOpen: boolean, animate: boolean) => {
    if (!nextOpen && sheetRef.current?.contains(document.activeElement)) {
      triggerRef.current?.focus({ preventScroll: true });
    }
    openRef.current = nextOpen;
    setOpen(nextOpen);
    setMobileSheet(previous => ({
      // A sheet closed before its entry frame needs no exit animation.
      present: nextOpen || (animate && previous.visible),
      visible: nextOpen && (previous.present || !animate),
      motion: animate ? 'animate' : 'instant',
    }));
  };

  useLayoutEffect(() => {
    if (!isMobile || !open || !mobileSheet.present || mobileSheet.visible) return;
    // Commit a hidden frame before targeting the CSS transition; no JS animation loop.
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        setMobileSheet(previous => ({ ...previous, visible: true }));
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [isMobile, open, mobileSheet.present, mobileSheet.visible]);

  useLayoutEffect(() => {
    if (!isMobile || open || !mobileSheet.present || mobileSheet.visible) return;
    const sheet = sheetRef.current;
    if (!sheet) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    let fallback: ReturnType<typeof setTimeout>;
    const finish = () => {
      if (!openRef.current) setMobileSheet(CLOSED_SHEET);
    };
    const onEnd = (event: TransitionEvent) => {
      if (event.target === sheet && event.propertyName === (mq.matches ? 'opacity' : 'transform')) finish();
    };
    const scheduleFallback = () => {
      clearTimeout(fallback);
      const duration = getComputedStyle(sheet).transitionDuration;
      const durationMs = parseFloat(duration) * (duration.endsWith('ms') ? 1 : 1000);
      fallback = setTimeout(finish, durationMs + 50);
    };
    scheduleFallback();
    sheet.addEventListener('transitionend', onEnd);
    mq.addEventListener('change', scheduleFallback);
    return () => {
      clearTimeout(fallback);
      sheet.removeEventListener('transitionend', onEnd);
      mq.removeEventListener('change', scheduleFallback);
    };
  }, [isMobile, open, mobileSheet.present, mobileSheet.visible]);

  useEffect(() => {
    if (!isMobile || !mobileSheet.present) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') changeMobileOpen(false, false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isMobile, mobileSheet.present]);

  const handleTriggerClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (isMobile) changeMobileOpen(!openRef.current, event.detail > 0);
    else setOpen(o => !o);
  };

  const activeCount = allSelected ? 0 : selected.length;

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      onClick={handleTriggerClick}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors',
        !allSelected
          ? 'border-[rgb(var(--accent-strong))] bg-[rgb(var(--accent-strong))] text-white'
          : 'border-[rgb(var(--border-strong))] bg-[rgb(var(--surface-muted))] text-[rgb(var(--text-muted))] hover:bg-[rgb(var(--surface))]'
      )}
    >
      {label}
      {!allSelected && (
        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-white/25 px-1 text-[10px] font-semibold text-white">
          {activeCount}
        </span>
      )}
      <ChevronDown className={cn('h-3 w-3 transition-transform', open && !isMobile && 'rotate-180')} />
    </button>
  );

  const dropdown = open && !isMobile && createPortal(
    <div
      ref={panelRef}
      onMouseDown={e => e.stopPropagation()}
      className="fixed z-[200] flex min-w-44 flex-col overflow-hidden rounded-xl border shadow-lg"
      style={{
        top: placement?.top ?? 0,
        left: placement?.left ?? 0,
        maxHeight: placement?.maxHeight,
        visibility: placement ? 'visible' : 'hidden',
        backgroundColor: 'rgb(var(--surface))',
        borderColor: 'rgb(var(--border-strong))',
      }}
    >
      <OptionList
        options={options}
        selected={selected}
        allSelected={allSelected}
        onToggle={onToggle}
        onToggleAll={onToggleAll}
      />
    </div>,
    document.body
  );

  const bottomSheet = mobileSheet.present && isMobile && createPortal(
    <>
      <div
        className="mobile-filter-backdrop fixed inset-0 z-40 bg-black/40"
        data-visible={mobileSheet.visible}
        data-motion={mobileSheet.motion}
        onClick={event => { if (openRef.current) changeMobileOpen(false, event.detail > 0); }}
        aria-hidden
      />
      <div
        ref={sheetRef}
        className="mobile-filter-sheet fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl"
        data-visible={mobileSheet.visible}
        data-motion={mobileSheet.motion}
        inert={!open}
        aria-hidden={!open || undefined}
        style={{ backgroundColor: 'rgb(var(--surface))' }}
      >
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'rgb(var(--border))' }}>
          <span className="text-sm font-semibold" style={{ color: 'rgb(var(--text))' }}>{label}</span>
          <button
            type="button"
            onClick={event => changeMobileOpen(false, event.detail > 0)}
            aria-label={`Close ${label} filter`}
            className="rounded-full p-1 transition-colors hover:bg-[rgb(var(--surface-muted))]"
            style={{ color: 'rgb(var(--text-muted))' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <OptionList
          options={options}
          selected={selected}
          allSelected={allSelected}
          onToggle={value => { if (openRef.current) onToggle(value); }}
          onToggleAll={() => { if (openRef.current) onToggleAll(); }}
          mobile
        />
        <div className="h-[env(safe-area-inset-bottom,0px)]" />
      </div>
    </>,
    document.body
  );

  return (
    <>
      {trigger}
      {dropdown}
      {bottomSheet}
    </>
  );
};

export default MultiSelectDropdown;
