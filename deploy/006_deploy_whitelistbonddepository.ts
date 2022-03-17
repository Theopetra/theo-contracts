
import hre from 'hardhat';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import getNamedMockAddresses from './mocks/helpers';
import { CONTRACTS } from '../utils/constants';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  try {
    const { deployments, getChainId, getNamedAccounts } = hre;
    const { deploy } = deployments;

    const TheopetraAuthority = await deployments.get(CONTRACTS.authority);
    const { deployer } = await getNamedAccounts();
    const chainId = await getChainId();
    const args = [TheopetraAuthority.address, deployer, deployer, deployer, deployer];

    // If on Hardhat network, update args with addresses of already-deployed mocks
    if (chainId === '1337') {
      const { TheopetraERC20Mock, sTheoMock, StakingMock, TreasuryMock } = await getNamedMockAddresses(hre);
      args.splice(1, 4, TheopetraERC20Mock, sTheoMock, StakingMock, TreasuryMock);
    }

    await deploy(CONTRACTS.whitelistBondDepo, {
      from: deployer,
      log: true,
      args,
    });
  } catch (error) {
    console.log(error);
  }
};

export default func;
func.tags = [CONTRACTS.whitelistBondDepo];
func.dependencies = hre?.network?.config?.chainId === 1337 ? [CONTRACTS.authority, 'Mocks'] : [CONTRACTS.authority];
