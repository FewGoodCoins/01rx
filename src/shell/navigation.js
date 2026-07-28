export function createShellNavigation(options = {}) {
  const runtime = options.window || globalThis.window;
  const routes = options.routes;

  function navToAllTokens() {
    runtime.document.querySelectorAll('.tp-lp-sublabel').forEach((element) => {
      element.classList.remove('tp-lp-active');
    });
    runtime.document.querySelectorAll('.tp-item').forEach((element) => {
      element.classList.remove('active');
    });
    const landingView = runtime.document.getElementById('landing-view');
    const dashboardView = runtime.document.getElementById('dashboard-view');
    if (landingView) landingView.classList.add('active');
    if (dashboardView) dashboardView.classList.remove('active');
    runtime.document.body.classList.remove('is-token');
    runtime.document.body.classList.remove('is-dashboard');
    if (typeof runtime.stopTxPolling === 'function') runtime.stopTxPolling();
    runtime.history.pushState({}, '', routes.homePageUrl());
    runtime.document.title = 'NAVgator - Treasury Analytics for Ownership Tokens';
    runtime.setBreadcrumb([{
      label: 'All Tokens',
      current: true,
    }]);
    if (typeof runtime.setLaunchpadFilter === 'function') runtime.setLaunchpadFilter(null);
    if (typeof runtime.refreshHealthStatus === 'function') runtime.refreshHealthStatus();
    if (typeof runtime.scheduleHealthPolling === 'function') runtime.scheduleHealthPolling();
  }

  return { navToAllTokens };
}
