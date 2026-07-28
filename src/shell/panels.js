const RIGHT_PANEL_STORAGE_KEY = 'navgator_right_panel_collapsed';
const LEFT_PANEL_STORAGE_KEY = 'navgator_left_panel_collapsed';

export function createShellPanelController(options = {}) {
  const runtime = options.window || globalThis.window;
  const documentRef = options.document || runtime.document;
  const storage = options.storage || runtime.localStorage;
  const setTimeoutImpl = options.setTimeout;
  const EventImpl = options.Event;
  const state = {
    left: false,
    right: storage.getItem(RIGHT_PANEL_STORAGE_KEY) === '1',
  };

  // The left rail is intentionally pinned open on every page load.
  storage.removeItem(LEFT_PANEL_STORAGE_KEY);

  function refreshControls() {
    const leftButton = documentRef.getElementById('left-panel-toggle');
    const rightButton = documentRef.getElementById('right-panel-toggle');
    const leftOpen = !state.left;
    const rightOpen = !state.right;
    documentRef.body.classList.toggle('left-panel-collapsed', !leftOpen);
    documentRef.body.classList.toggle('right-panel-collapsed', !rightOpen);

    if (leftButton) {
      leftButton.setAttribute('aria-expanded', leftOpen ? 'true' : 'false');
      leftButton.setAttribute('aria-label', leftOpen ? 'Collapse left panel' : 'Expand left panel');
      leftButton.title = leftOpen ? 'Collapse left panel' : 'Expand left panel';
    }
    if (rightButton) {
      rightButton.setAttribute('aria-expanded', rightOpen ? 'true' : 'false');
      rightButton.setAttribute('aria-label', rightOpen ? 'Collapse right panel' : 'Expand right panel');
      rightButton.title = rightOpen ? 'Collapse right panel' : 'Expand right panel';
    }
  }

  function notifyResize() {
    function notify() {
      try {
        const EventConstructor = EventImpl || runtime.Event;
        runtime.dispatchEvent(new EventConstructor('resize'));
      } catch (error) {}
      if (typeof runtime.drawAllSparklines === 'function') {
        try {
          runtime.drawAllSparklines();
        } catch (error) {}
      }
    }
    if (setTimeoutImpl) {
      setTimeoutImpl(notify, 40);
      setTimeoutImpl(notify, 180);
    } else {
      runtime.setTimeout(notify, 40);
      runtime.setTimeout(notify, 180);
    }
  }

  function togglePanel(side) {
    if (side !== 'left' && side !== 'right') return;
    state[side] = !state[side];
    storage.setItem(`navgator_${side}_panel_collapsed`, state[side] ? '1' : '0');
    refreshControls();
    notifyResize();
  }

  return {
    notifyResize,
    refreshControls,
    state,
    togglePanel,
  };
}
