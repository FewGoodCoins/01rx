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
    right: false,
  };

  // The market explorer is optional workspace chrome. Remember the user's
  // choice while keeping the retired right-rail preference pinned open.
  try {
    state.left = storage.getItem(LEFT_PANEL_STORAGE_KEY) === '1';
    storage.removeItem(RIGHT_PANEL_STORAGE_KEY);
  } catch (_) {
    // Storage can be unavailable in privacy-restricted browser contexts. The
    // in-memory control remains fully functional for the current session.
  }

  function refreshControls() {
    const leftButton = documentRef.getElementById('left-panel-toggle');
    const rightButton = documentRef.getElementById('right-panel-toggle');
    const leftOpen = !state.left;
    const rightOpen = !state.right;
    documentRef.body.classList.toggle('left-panel-collapsed', !leftOpen);
    documentRef.body.classList.toggle('right-panel-collapsed', !rightOpen);

    if (leftButton) {
      leftButton.setAttribute('aria-expanded', leftOpen ? 'true' : 'false');
      leftButton.setAttribute(
        'aria-label',
        leftOpen ? 'Hide market explorer' : 'Show market explorer',
      );
      leftButton.title = leftOpen ? 'Hide market explorer' : 'Show market explorer';
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
    if (side !== 'left') {
      if (side === 'right') refreshControls();
      return false;
    }
    state.left = !state.left;
    try {
      storage.setItem(LEFT_PANEL_STORAGE_KEY, state.left ? '1' : '0');
    } catch (_) {
      // The visual state does not depend on persistence succeeding.
    }
    refreshControls();
    notifyResize();
    return state.left;
  }

  return {
    notifyResize,
    refreshControls,
    state,
    togglePanel,
  };
}
