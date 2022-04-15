import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { CONTRACTS } from '../utils/constants';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const TheopetraAuthority = await deployments.get(CONTRACTS.authority);

  await deploy(CONTRACTS.founderVesting, {
    from: deployer,
    log: true,
    args: [[TheopetraAuthority.address],[1_000_000_000]],
  });
};

export default func;
func.tags = [CONTRACTS.founderVesting];
func.dependencies = [CONTRACTS.authority];
