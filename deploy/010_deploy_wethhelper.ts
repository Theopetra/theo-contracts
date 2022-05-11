import hre from 'hardhat';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import getNamedMockAddresses from './mocks/helpers';
import { CONTRACTS } from '../utils/constants';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, getChainId } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = await getChainId();
  let args: any = [];

  // TODO: Update args to use WETH address when deploying to live network

  const TheopetraBondDepository = await deployments.get(CONTRACTS.bondDepo);

  if(chainId === '1337'){
    const { WETH9 } = await getNamedMockAddresses(hre);
    args = [WETH9, TheopetraBondDepository.address];
  }

  await deploy(CONTRACTS.WethHelper, {
    from: deployer,
    log: true,
    args
  });
};

export default func;
func.tags = [CONTRACTS.WethHelper];
func.dependencies = [CONTRACTS.bondDepo];
