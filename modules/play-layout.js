// Play layout
(() => {
  const grid = document.querySelector(".play-section-grid");
  if (!grid) return;

  const gap = 10;
  let frame = 0;
  let arranging = false;

  function schedule() {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(layout);
  }

  function setCardBox(card, left, top, width) {
    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.round(top)}px`;
    card.style.width = `${Math.max(0, Math.floor(width))}px`;
  }

  function cardHeight(card) {
    return Math.ceil(card.getBoundingClientRect().height);
  }

  function columnCount(width) {
    if (width >= 1180) return 3;
    if (width >= 760) return 2;
    return 1;
  }

  function balancedColumns(items, count) {
    if (count === 1) return [{ items: [...items], height: 0 }];
    const columns = Array.from({ length: count }, () => ({ items: [], height: 0 }));
    [...items]
      .sort((a, b) => b.height - a.height || a.index - b.index)
      .forEach(item => {
        const column = columns.reduce((best, current) => current.height < best.height ? current : best, columns[0]);
        column.items.push(item);
        column.height += item.height + gap;
      });
    columns.forEach(column => column.items.sort((a, b) => a.index - b.index));
    return columns;
  }

  function layout() {
    frame = 0;
    if (arranging) return;
    const width = grid.clientWidth;
    if (!width || grid.closest("[hidden]")) return;
    arranging = true;
    grid.classList.add("play-masonry");

    const cards = Array.from(grid.children).filter(card => card.classList.contains("play-card") && !card.hidden);
    const topCards = cards.filter(card => card.classList.contains("play-quickstart-card") || card.classList.contains("play-scenes-card"));
    const fixed = new Set(topCards);
    const regularCards = cards.filter(card => !fixed.has(card));
    const count = columnCount(width);
    const columnWidth = (width - gap * (count - 1)) / count;
    let top = 0;

    topCards.forEach(card => {
      setCardBox(card, 0, top, width);
      top += cardHeight(card) + gap;
    });

    const measured = regularCards.map((card, index) => {
      setCardBox(card, 0, top, columnWidth);
      return { card, index, height: cardHeight(card) };
    });
    const columns = balancedColumns(measured, count);
    let regularBottom = top;

    columns.forEach((column, columnIndex) => {
      let columnTop = top;
      column.items.forEach(item => {
        setCardBox(item.card, columnIndex * (columnWidth + gap), columnTop, columnWidth);
        columnTop += item.height + gap;
      });
      regularBottom = Math.max(regularBottom, columnTop);
    });

    top = regularCards.length ? regularBottom : top;
    grid.style.height = `${Math.max(0, top - gap)}px`;
    arranging = false;
  }

  const resizeObserver = new ResizeObserver(schedule);
  resizeObserver.observe(grid);
  Array.from(grid.children).forEach(card => resizeObserver.observe(card));

  const mutationObserver = new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => {
      if (node instanceof HTMLElement && node.classList.contains("play-card")) resizeObserver.observe(node);
    }));
    schedule();
  });
  mutationObserver.observe(grid, { childList: true });

  new MutationObserver(schedule).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  window.addEventListener("resize", schedule, { passive: true });
  document.addEventListener("toggle", event => {
    if (event.target instanceof HTMLDetailsElement && grid.contains(event.target)) schedule();
  }, true);
  schedule();
})();
