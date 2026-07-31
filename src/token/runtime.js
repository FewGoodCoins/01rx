import { installBrowserChartData } from './chart-data.js';
import { installBrowserLaunchpadSections } from './launchpad-sections.js';
import { installBrowserNavModel } from './nav-model.js';
import { installBrowserProposalModel } from './proposal-model.js';
import { installBrowserTokenController } from './token-controller.js';

export function installBrowserTokenPage(browserWindow) {
  const chartData = installBrowserChartData(browserWindow);
  const launchpadSections = installBrowserLaunchpadSections(browserWindow);
  const navModel = installBrowserNavModel(browserWindow);
  const proposalModel = installBrowserProposalModel(browserWindow);
  const tokenController = installBrowserTokenController(browserWindow);

  return {
    chartData,
    launchpadSections,
    navModel,
    proposalModel,
    tokenController,
  };
}
