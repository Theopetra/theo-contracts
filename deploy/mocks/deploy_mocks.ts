import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { MOCKS } from '../../utils/constants';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  const chainId = await getChainId();

  // If on Hardhat network, deploy mocks
  if (chainId === '1337') {
    for (const key in MOCKS) {
      await deploy(MOCKS[key], {
        from: deployer,
        log: true,
      });
    }
  }
};

export default func;
func.tags = ['Mocks'];
