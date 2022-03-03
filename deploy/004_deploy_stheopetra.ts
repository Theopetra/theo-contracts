import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { CONTRACTS } from '../utils/constants';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const TheopetraAuthority = await deployments.get(CONTRACTS.authority);
  const { deployer } = await getNamedAccounts();

  await deploy(CONTRACTS.sTheo, {
      from: deployer,
      log: true,
      args: [TheopetraAuthority.address]
  });
};

export default func;
func.tags = [CONTRACTS.sTheo];
func.dependencies = [CONTRACTS.authority];