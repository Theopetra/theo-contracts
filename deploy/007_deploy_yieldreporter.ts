import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { CONTRACTS } from '../utils/constants';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const TheopetraAuthority = await deployments.get(CONTRACTS.authority);

  await deploy(CONTRACTS.yieldReporter, {
    from: deployer,
    log: true,
    args: [TheopetraAuthority.address],
  });
};

export default func;
func.tags = [CONTRACTS.yieldReporter];
func.dependencies = [CONTRACTS.authority];
