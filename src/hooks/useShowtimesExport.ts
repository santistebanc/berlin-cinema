import { RefObject, useState } from 'react';
import { toPng } from 'html-to-image';

export const useShowtimesExport = (
  movieTitle: string,
  tableRef: RefObject<HTMLDivElement | null>
) => {
  const [imageExporting, setImageExporting] = useState(false);

  const downloadImage = async () => {
    const node = tableRef.current;
    if (!node) return;

    setImageExporting(true);

    try {
      const isDark = document.documentElement.classList.contains('dark');
      const safeName = movieTitle.replace(/[/\\?%*:|"<>]/g, '-').trim().slice(0, 120) || 'showtimes';
      const scrollWrap = node.querySelector<HTMLElement>('[data-showings-scroll]');
      const tableEl = node.querySelector<HTMLTableElement>('table');
      const fullWidth = Math.max(
        scrollWrap?.scrollWidth ?? 0,
        tableEl?.scrollWidth ?? 0,
        tableEl?.offsetWidth ?? 0,
        node.scrollWidth
      );
      const fullHeight = node.scrollHeight;

      type SavedStyle = { el: HTMLElement; overflow: string; overflowX: string; overflowY: string };
      const saved: SavedStyle[] = [];
      const scrollValues = new Set(['auto', 'scroll']);

      [node, ...Array.from(node.querySelectorAll<HTMLElement>('*'))].forEach((element) => {
        const computedStyle = getComputedStyle(element);

        if (
          scrollValues.has(computedStyle.overflow) ||
          scrollValues.has(computedStyle.overflowX) ||
          scrollValues.has(computedStyle.overflowY)
        ) {
          saved.push({
            el: element,
            overflow: element.style.overflow,
            overflowX: element.style.overflowX,
            overflowY: element.style.overflowY,
          });

          if (scrollValues.has(computedStyle.overflow)) element.style.overflow = 'visible';
          if (scrollValues.has(computedStyle.overflowX)) element.style.overflowX = 'visible';
          if (scrollValues.has(computedStyle.overflowY)) element.style.overflowY = 'visible';
        }
      });

      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        cacheBust: true,
        skipFonts: true,
        backgroundColor: isDark ? '#1f2937' : '#ffffff',
        width: fullWidth,
        height: fullHeight,
        onclone: (documentClone, clonedNode) => {
          const root = clonedNode as HTMLElement;
          const clonedWrap = root.querySelector<HTMLElement>('[data-showings-scroll]');

          root.style.width = `${fullWidth}px`;
          root.style.maxWidth = 'none';
          root.style.overflow = 'visible';

          if (clonedWrap) {
            clonedWrap.style.width = `${fullWidth}px`;
            clonedWrap.style.maxWidth = 'none';
            clonedWrap.style.overflow = 'visible';
          }

          const noScrollStyle = documentClone.createElement('style');
          noScrollStyle.textContent =
            '* { scrollbar-width: none !important; } *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }';
          documentClone.head.appendChild(noScrollStyle);

          root.querySelectorAll('.sticky').forEach((stickyElement) => {
            const element = stickyElement as HTMLElement;
            element.style.position = 'relative';
            element.style.left = 'auto';
            element.style.boxShadow = 'none';
          });
        },
      });

      saved.forEach(({ el, overflow, overflowX, overflowY }) => {
        el.style.overflow = overflow;
        el.style.overflowX = overflowX;
        el.style.overflowY = overflowY;
      });

      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${safeName}-showtimes.png`;
      link.click();
    } catch (error) {
      console.error('Failed to export showings table image:', error);
    } finally {
      setImageExporting(false);
    }
  };

  return {
    downloadImage,
    imageExporting,
  };
};
