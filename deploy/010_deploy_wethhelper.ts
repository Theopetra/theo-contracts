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

  const TheopetraAuthority = await deployments.get(CONTRACTS.authority);
  const TheopetraBondDepository = await deployments.get(CONTRACTS.bondDepo);
  const WhitelistTheopetraBondDepository = await deployments.get(CONTRACTS.whitelistBondDepo);

  const args = [TheopetraAuthority.address, TheopetraBondDepository.address, WhitelistTheopetraBondDepository.address];

  // Add WETH address, depending on network
  if (chainId === '1337') {
    const { WETH9 } = await getNamedMockAddresses(hre);
    args.unshift(WETH9);
  } else if (chainId === '4') {
    // Rinkeby network WETH address
    args.unshift('0xc778417E063141139Fce010982780140Aa0cD5Ab');
  } else if (chainId === '1') {
    // Mainnet WETH address
    args.unshift('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
  }

  await deploy(CONTRACTS.WethHelper, {
    from: deployer,
    log: true,
    args,
  });
};

export default func;
func.tags = [CONTRACTS.WethHelper];
