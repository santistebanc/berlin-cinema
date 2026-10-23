# 001 — Animate the mobile filter sheet entrance and exit

- **Status**: DONE
- **Commit**: `1641dedd`
- **Severity**: MEDIUM
- **Category**: Missed opportunities; spatial consistency and interruptibility
- **Estimated scope**: 2 application files, approximately 100–160 lines; update this plan's status after execution.

## Problem

The Cinemas, Dates and Versions filters share `src/components/ui/MultiSelectDropdown.tsx`. Below 640 CSS pixels, each opens a bottom sheet. Opening and closing currently mount and unmount the portal immediately, so neither transition has a spatial bridge.

Current code, verbatim (`src/components/ui/MultiSelectDropdown.tsx:215`):

```tsx
  const bottomSheet = open && isMobile && createPortal(
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl"
        style={{ backgroundColor: 'rgb(var(--surface))' }}
      >
```

The close button also calls `setOpen(false)` at line 230. The body scroll lock currently follows logical open state, verbatim (`src/components/ui/MultiSelectDropdown.tsx:157`):

```tsx
  useEffect(() => {
    if (!open || !isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open, isMobile]);

  const handleTriggerClick = () => setOpen(o => !o);
```

Simply adding a transition cannot animate exit because the sheet disappears from the DOM at once. Delaying removal must also retain scroll lock, handle cancellation, and prevent closing controls from receiving input.

This is occasional surface motion, intended to explain the sheet's bottom-edge origin. Option toggles and the screening results must remain immediate. Frequencies are workflow estimates, not analytics. The existing UI was inspected from source; live browser inspection previously timed out, so no timing has been feel-checked yet.

## Target

For pointer/touch activation below 640px:

- Enter from `transform: translateY(100%)` to `translateY(0)` in **220ms**.
- Exit along the same path in **200ms**.
- Backdrop opacity transitions between **0 and 1** in **160ms**. Keep its existing `bg-black/40`; do not animate background color or double-apply its opacity.
- Every transition uses the existing `--ease-out`, exactly `cubic-bezier(0.23, 1, 0.32, 1)`.
- Under `@media (prefers-reduced-motion: reduce)`, remove translation entirely and fade both sheet and backdrop between opacity **0 and 1** in **120ms**, using the same curve.
- Keyboard/assistive activation (`click.detail === 0`), Escape dismissal, breakpoint changes and route unmount are immediate, including in reduced-motion mode.
- CSS transitions retarget a rapid reversal from its current visual state. No keyframes, springs, bounce, stagger, drag gesture, press scale or additional library.

Add these durations to the existing root token block in `src/index.css:333`; preserve both existing easing tokens:

```css
--duration-mobile-filter-enter: 220ms;
--duration-mobile-filter-exit: 200ms;
--duration-mobile-filter-backdrop: 160ms;
--duration-mobile-filter-reduced: 120ms;
```

Use these component-scoped styles after the token block (outside `@layer`, matching existing motion CSS). `data-visible` describes the visual target; `data-motion` describes the current operation's modality:

```css
.mobile-filter-sheet {
  transform: translateY(100%);
  opacity: 1;
  transition: transform var(--duration-mobile-filter-exit) var(--ease-out);
}
.mobile-filter-sheet[data-visible="true"] {
  transform: translateY(0);
  transition-duration: var(--duration-mobile-filter-enter);
}
.mobile-filter-backdrop {
  opacity: 0;
  transition: opacity var(--duration-mobile-filter-backdrop) var(--ease-out);
}
.mobile-filter-backdrop[data-visible="true"] { opacity: 1; }

@media (prefers-reduced-motion: reduce) {
  .mobile-filter-sheet {
    transform: none;
    opacity: 0;
    transition-property: opacity;
  }
  .mobile-filter-sheet[data-visible="true"] {
    transform: none;
    opacity: 1;
  }
  .mobile-filter-sheet,
  .mobile-filter-sheet[data-visible="true"],
  .mobile-filter-backdrop {
    transition-duration: var(--duration-mobile-filter-reduced);
  }
}

.mobile-filter-sheet[data-motion="instant"],
.mobile-filter-backdrop[data-motion="instant"] {
  transition: none;
}
```

The instant override intentionally follows reduced-motion styles. No hover behavior is added, so hover-capability gating is unnecessary.

## Repo conventions to follow

- React 19, TypeScript and Tailwind 3; plain CSS handles existing motion. Keep the existing `MultiSelectDropdownProps` unchanged and the implementation private to this file.
- The root token block at `src/index.css:333` defines `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`. The root view transition at lines 340–344 is an exemplar of reusing that token with an explicit duration. Do not introduce a parallel curve.
- The `(max-width: 639px)` matchMedia listener at `src/components/ui/MultiSelectDropdown.tsx:116` owns the responsive split. Preserve that exact breakpoint.
- The existing mobile portal renders into `document.body`, uses z-40/z-50, and retains the safe-area spacer at line 245. Preserve its layout, colors, scrolling region and stacking.
- `src/components/ShowtimesToolbar.tsx:93`, `:102`, and `:112` already instantiate the shared filter. No caller changes are necessary.
- `src/main.tsx:12` enables React StrictMode. Effects must tolerate setup/cleanup/setup without a stale frame callback, timer, listener or scroll lock.

## Steps

1. **Add the CSS above in `src/index.css`.** Preserve the existing poster transitions and reduced-motion rules. The only animated properties are transform and opacity.

2. **Separate intent from presence inside `src/components/ui/MultiSelectDropdown.tsx`.** Keep `open` as the logical intent used by the desktop dropdown. Add private mobile presence state, visual-target state, a sheet element ref, an operation-modality ref/state, and cancellation refs for scheduled frames and exit fallback. The mobile portal condition becomes `isMobile && mobilePresent`, rather than `open && isMobile`. Keep its DOM identity stable during reversals.

3. **Centralize mobile opening/closing.** Change the trigger handler to accept `React.MouseEvent<HTMLButtonElement>`. Treat `event.detail > 0` as animated pointer/touch activation and zero as instant. Route the existing mobile close button and backdrop through the same close helper. Desktop behavior remains the existing immediate open/close logic. Set operation modality before changing open state. Never infer modality from hover capability or a persistent global “last input” flag.

4. **Implement these lifecycle rules with layout effects and cancellable callbacks:**
   - Initial state: logical closed, absent portal, hidden visual target.
   - Fresh pointer opening: mount present with hidden target; after a committed hidden frame, set target visible. A pair of `requestAnimationFrame` callbacks is an acceptable staging mechanism. Track and cancel both callbacks. Do not measure or animate layout, and do not use a JS frame loop for motion.
   - Fresh instant opening: mount present and visible together, with `data-motion="instant"`; do not stage a hidden frame.
   - Closing an animated, painted sheet: set logical open false and visual target hidden, retaining presence. Cancel pending entry frames. Keep the same DOM elements so CSS can retarget from their current transform/opacity.
   - Closing before the visible entry frame has committed: cancel entry and remove immediately; never briefly reveal a sheet after its close request.
   - Reopening while exit is running: cancel pending removal, preserve presence, and retarget visible. A late completion event must recheck current logical intent and never remove a reopened sheet.
   - Instant close: cancel all callbacks and unmount immediately, regardless of current animation state.
   - Exit completion: listen on the sheet itself, ignoring bubbling child transitions. Use `transform` completion normally and `opacity` with reduced motion. Remove only when the latest intent is still closed. Do not unmount on `transitioncancel`: cancellation can mean reversal.
   - Include a cancellable fallback for absent transition events: current computed exit transition duration plus **50ms**. Normally this is **250ms**, or **170ms** with reduced motion. Read the computed duration so CSS remains the timing source. On reduced-motion preference changes during exit, re-evaluate the completion property and fallback. Never use the backdrop's earlier completion to remove the sheet.
   - On crossing the 639/640px breakpoint, cancel mobile callbacks and discard mobile presence immediately. Preserve the existing logical open value and responsive desktop behavior. On route/component unmount, cancel every frame, timeout and listener.

5. **Wire state into the existing mobile markup.** Add `mobile-filter-sheet` and `mobile-filter-backdrop`, plus `data-visible` and `data-motion` on both existing elements; avoid a transformed wrapper around the fixed portal. Attach completion handling only to the sheet. Keep backdrop hit-testing active during exit to prevent click-through to screening links, but make repeated dismissals no-ops while closed. Make the exiting sheet `inert` and `aria-hidden` immediately so it is only a visual remnant. Re-enable it immediately on reversal. Disable any option callbacks while logical open is false as a defensive guard.

6. **Align cleanup with presence.** Change the mobile body-lock effect condition to `isMobile && (open || mobilePresent)` and include presence in its dependencies. Share a private lock count across filter instances so a closing sheet cannot unlock a newly opened one; restore the original inline overflow value only when the last sheet releases its lock. On a normal close, release its lock after the portal is removed. On an instant close, breakpoint change or unmount, release immediately. If the focused element is within the closing sheet, return focus to its trigger before making it inert; use `focus({ preventScroll: true })`. Do not defer focus work until animation completion. Add an accessible `aria-label` such as `Close Dates filter` to the mobile X button using the existing label prop. Add an Escape listener while the mobile sheet is present, including its exit, that dismisses instantly and cleans up on removal/unmount; the original sheet has no Escape listener.

7. **Verify the cases below, then update `plans/README.md` and this plan to DONE.** Record actual validation and any limits; do not claim device or browser checks that were not run.

## Boundaries

- Application edits are limited to `src/components/ui/MultiSelectDropdown.tsx` and `src/index.css`. Updating this plan and `plans/README.md` after execution is allowed.
- Do not animate the desktop filter popover, options, checkmarks, filter counts, showtime results, navigation, cinema popup or share confirmation.
- Do not change filter selection rules, URL parameters, responsive breakpoint, placement calculation, scroll-region size, colors, spacing, radii or safe-area padding.
- Do not add dependencies, new global modal infrastructure, swipe-to-dismiss or permanent `will-change`. Preserve the existing markup except the explicit lifecycle attributes/handlers above.
- Keyboard/assistive activation and Escape must bypass motion; reduced-motion pointer use retains the gentle fade.
- If the cited lifecycle or portal structure has drifted since the stamped commit, stop and report the mismatch before executing a different design.

## Verification

These are executor checks, not checks performed while authoring this plan.

- **Mechanical:** Run `npm run typecheck` from the repository with Node 24 and installed dependencies. Expect exit 0; distinguish pre-existing errors from introduced ones. Check `git diff --check`. Confirm the application diff touches only the two named files and only the intended mobile behavior. No build is required for this scope; the repository's build hooks regenerate data/artifacts.
- **Browser setup:** Reuse the existing local dev server if one is running. Otherwise run `npm exec vite -- --host 0.0.0.0 --port 3000` to serve the existing data without the `npm run dev` preparation hook. In T3 use `preview_status`, then `preview_open` if needed, and navigate to this server. If live preview fails, record the exact failure and follow the browser fallback rules; do not mark visual checks passed from source alone.
- **Functional cases:** At 390×844, open a film with upcoming screenings, then open/close each available filter. Test X and backdrop dismissal, option toggles, All, long-list scrolling, and retained selections. No selection waits for an animation. Verify the page cannot scroll during entrance, open state or exit, and its previous scroll position/overflow value returns afterward.
- **Lifecycle cases:** Close during entrance, request reopen during exit, change viewport between 639px and 640px during motion, and navigate away while open/closing. Use browser evaluation to click the trigger with a pointer-style MouseEvent (`detail: 1`) when testing a rapid reopen that the backdrop otherwise prevents. Confirm no old callback removes the reopened sheet, unlocks scrolling early, leaves a portal behind or logs a state-update warning. Check normal and StrictMode effect cleanup.
- **Input/accessibility cases:** At mobile width, activate the trigger and X using Enter/Space and close using Escape. They complete immediately. Tab never reaches exiting options; focus restoration never waits for the transition. Verify assistive/synthetic click detail zero follows the same instant path.
- **Reduced motion:** Enable `prefers-reduced-motion: reduce` in browser emulation/DevTools. Pointer open/close uses a 120ms opacity fade with no vertical displacement. Keyboard remains immediate. Toggle the preference during exit and confirm cleanup completes without a stranded backdrop.
- **Feel check:** At normal playback, the bottom edge is the sole origin and exit path; the background schedule remains stationary. In DevTools Animations at 10% playback, confirm the sheet starts fully below the viewport, reversals continue from their current position, and there is no one-frame flash or early disappearance. Test a real mobile device if available; otherwise state that only emulation was checked.
- **Performance/scope check:** Capture one open/close in the Performance panel on a film with many screenings. Motion must use CSS transform/opacity without per-frame React updates or layout animation. At 640px and desktop width, verify existing popover placement, scroll/resize dismissal and immediate mount/unmount are unchanged.
- **Done when:** All executed checks above pass, entrance/exit/fade values match the target, no stale presence or scroll lock survives interruption, and any unexecuted real-device checks are explicitly recorded.

## Execution record — 2026-10-20

- Implemented in `src/components/ui/MultiSelectDropdown.tsx` and `src/index.css`; no dependencies or caller changes.
- `npm run typecheck` passed before implementation and after the completed source edits, using Node 24.18.0. `git diff --check` passed.
- Used T3's collaborative browser against Vite on port 3000. The current published data produced no films after time-based filtering. Browser verification therefore mounted the actual shared dropdown under React StrictMode in a temporary browser-only fixture with Cinemas (25 options), Dates (8), and Versions (3). No listing files or application source were changed to supply test data.
- Confirmed actual computed CSS and browser transitions: 220ms entry, 200ms exit, 160ms backdrop, and `cubic-bezier(0.23, 1, 0.32, 1)`. Option toggles, All, long-list scrolling, focus return, inert exit controls, and backdrop click shielding passed.
- Confirmed close before entry, exit reversal without remount or position jump, ignored child transition events, completion fallback after cancelled transitions, StrictMode unmount cleanup, and preservation of a pre-existing `overflow: scroll` value. One initial reversal assertion sampled separate animation frames; a same-frame `flushSync` check confirmed identical transforms immediately before and after reversal.
- Found and fixed an actual overlapping-sheet lock bug during verification: closing Dates, opening Versions before Dates finished exiting, then closing Versions could leave overflow incorrect. A private reference count now preserves the lock until the last visible sheet is removed; the regression case passed.
- Real Enter/Space browser input opens/closes without transitions. Escape removes both open and already-exiting sheets immediately. Exiting options are inert and guarded against callbacks.
- Tested the reduced-motion CSS branch and its matchMedia listener with a controlled browser-only media simulation: both surfaces faded in 120ms with no translation, including a preference change during exit. This was not a native OS preference test.
- Verified the 639/640px presentation switch during entrance and exit, desktop placement, and immediate native-scroll/resize dismissal at 640px. Inspected slowed entrance visually using a temporary browser-only 10x duration override; removed that override afterward.
- Limitations: no real mobile device, native OS reduced-motion toggle, or full application Performance-panel trace was tested. No browser integration check against current film showtimes was possible with the expired local listings. Motion uses CSS transform/opacity; JS only stages entry and handles lifecycle cleanup.
