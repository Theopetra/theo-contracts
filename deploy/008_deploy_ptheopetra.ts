import hre from 'hardhat';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { CONTRACTS } from '../utils/constants';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const TheopetraAuthority = await deployments.get(CONTRACTS.authority);

  await deploy(CONTRACTS.pTheo, {
    from: deployer,
    log: true,
    args: [TheopetraAuthority.address],
  });
};

export default func;
func.tags = [CONTRACTS.pTheo];
func.dependencies = hre?.network?.config?.chainId === 1337 ? [CONTRACTS.authority, 'Mocks'] : [CONTRACTS.authority];
