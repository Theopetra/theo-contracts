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

  if (chainId === '1337') {
    const TheopetraERC20Mock = await deployments.get(MOCKS.theoTokenMock);
    args = [
      process.env.NODE_ENV === TESTWITHMOCKS ? TheopetraERC20Mock.address : Theo.address,
      0,
      TheopetraAuthority.address,
    ];
  }

  await deploy(CONTRACTS.treasury, {
    from: deployer,
    log: true,
    args,
  });
};

export default func;
func.tags = [CONTRACTS.treasury];
func.dependencies = [CONTRACTS.Authority, CONTRACTS.theoToken, 'Mocks'];
