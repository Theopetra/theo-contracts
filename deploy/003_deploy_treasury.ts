import hre from 'hardhat';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { CONTRACTS } from '../utils/constants';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const TheopetraAuthority = await deployments.get(CONTRACTS.authority);
  const Theo = await deployments.get(CONTRACTS.theoToken);

  await deploy(CONTRACTS.treasury, {
    from: deployer,
    log: true,
    args: [Theo.address, deployer, TheopetraAuthority.address],
  });
};

export default func;
func.tags = [CONTRACTS.treasury];
func.dependencies = hre?.network?.config?.chainId === 1337 ? [CONTRACTS.Authority, CONTRACTS.theoToken] : [];
