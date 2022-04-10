import hre from 'hardhat';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import getNamedMockAddresses from './mocks/helpers';
import { CONTRACTS, TESTWITHMOCKS } from '../utils/constants';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  try {
    const { deployments, getChainId, getNamedAccounts } = hre;
    const { deploy } = deployments;

    const TheopetraAuthority = await deployments.get(CONTRACTS.authority);
    const TheopetraERC20Token = await deployments.get(CONTRACTS.theoToken);
    const sTheoToken = await deployments.get(CONTRACTS.sTheo);
    const Staking = await deployments.get(CONTRACTS.staking);
    const Treasury = await deployments.get(CONTRACTS.treasury);

    let args: any = [];

    const { deployer } = await getNamedAccounts();
    const chainId = await getChainId();
    args = [
      TheopetraAuthority.address,
      TheopetraERC20Token.address,
      sTheoToken.address,
      Staking.address,
      Treasury.address,
    ];

    // If on Hardhat network, update args with addresses of already-deployed mocks
    if (chainId === '1337' && process.env.NODE_ENV === TESTWITHMOCKS) {
      const { TheopetraERC20Mock, sTheoMock, StakingMock, TreasuryMock } = await getNamedMockAddresses(hre);
      args = [TheopetraAuthority.address, TheopetraERC20Mock, sTheoMock, StakingMock, TreasuryMock];
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
func.dependencies =
  hre?.network?.config?.chainId === 1337
    ? [CONTRACTS.authority, 'Mocks']
    : [CONTRACTS.authority, CONTRACTS.theoToken, CONTRACTS.sTheo, CONTRACTS.staking, CONTRACTS.treasury];
