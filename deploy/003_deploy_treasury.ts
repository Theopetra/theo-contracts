import hre from 'hardhat';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { CONTRACTS, MOCKS, TESTWITHMOCKS } from '../utils/constants';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = await getChainId();

  const TheopetraAuthority = await deployments.get(CONTRACTS.authority);
  const Theo = await deployments.get(CONTRACTS.theoToken);

  let args = [Theo.address, 0, TheopetraAuthority.address];

  if (chainId === '1337' && process.env.NODE_ENV === TESTWITHMOCKS) {
    const TheopetraERC20Mock = await deployments.get(MOCKS.theoTokenMock);
    args = [TheopetraERC20Mock.address, 0, TheopetraAuthority.address];
  }

  await deploy(CONTRACTS.treasury, {
    from: deployer,
    log: true,
    args,
  });
};

const baseDependencies = [CONTRACTS.Authority, CONTRACTS.theoToken];
export default func;
func.tags = [CONTRACTS.treasury];
func.dependencies = hre?.network?.config?.chainId === 1337 ? [...baseDependencies, 'Mocks'] : baseDependencies;
