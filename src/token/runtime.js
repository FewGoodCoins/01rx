import { installBrowserChartData } from './chart-data.js';
import { installBrowserNavModel } from './nav-model.js';
import { installBrowserProposalModel } from './proposal-model.js';
import { installBrowserTokenController } from './token-controller.js';

export function installBrowserTokenPage(browserWindow) {
  const chartData = installBrowserChartData(browserWindow);
  const navModel = installBrowserNavModel(browserWindow);
  const proposalModel = installBrowserProposalModel(browserWindow);
  const tokenController = installBrowserTokenController(browserWindow);

  return {
    chartData,
    navModel,
    proposalModel,
    tokenController,
  };
}
