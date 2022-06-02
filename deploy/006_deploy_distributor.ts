import hre from 'hardhat';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import getNamedMockAddresses from './mocks/helpers';
import { CONTRACTS, TESTWITHMOCKS } from '../utils/constants';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  try {
    const { deployments, getChainId, getNamedAccounts } = hre;
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();
    const chainId = await getChainId();

    const TheopetraAuthority = await deployments.get(CONTRACTS.authority);
    const TheopetraTreasury = await deployments.get(CONTRACTS.treasury);
    const TheopetraERC20Token = await deployments.get(CONTRACTS.theoToken);
    const Staking = await deployments.get(CONTRACTS.staking);

    const epochLength = 60 * 60 * 24 * 365;
    let args: any = [];

    args = [
      TheopetraTreasury.address,
      TheopetraERC20Token.address,
      epochLength,
      TheopetraAuthority.address,
      Staking.address,
    ];

    // If on Hardhat network, use the following values for testing
    if (chainId === '1337' && process.env.NODE_ENV === TESTWITHMOCKS) {
      const { TheopetraERC20Mock, TreasuryMock, StakingMock } = await getNamedMockAddresses(hre);
      args = [TreasuryMock, TheopetraERC20Mock, epochLength, TheopetraAuthority.address, StakingMock];
    }

    await deploy(CONTRACTS.distributor, {
      from: deployer,
      log: true,
      args,
    });
  } catch (error) {
    console.log(error);
  }
};

export default func;
func.tags = [CONTRACTS.distributor];
func.dependencies =
  hre?.network?.config?.chainId === 1337
    ? [CONTRACTS.authority, 'Mocks']
    : [CONTRACTS.authority, CONTRACTS.treasury, CONTRACTS.theoToken, CONTRACTS.staking];
