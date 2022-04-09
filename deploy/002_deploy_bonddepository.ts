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
    const TheopetraTreasury = await deployments.get(CONTRACTS.treasury);
    const sTheopetraERC20 = await deployments.get(CONTRACTS.sTheo);
    const Staking = await deployments.get(CONTRACTS.staking);

    const { deployer } = await getNamedAccounts();
    const chainId = await getChainId();
    let args: any = [];

    if (chainId === '1337') {
      if (process.env.NODE_ENV === TESTWITHMOCKS) {
        const { TheopetraERC20Mock, sTheoMock, StakingMock, TreasuryMock } = await getNamedMockAddresses(hre);
        args = [TheopetraAuthority.address, TheopetraERC20Mock, sTheoMock, StakingMock, TreasuryMock];
      } else {
        args = [
          TheopetraAuthority.address,
          TheopetraERC20Token.address,
          sTheopetraERC20.address,
          Staking.address,
          TheopetraTreasury.address,
        ];
      }
    }

    await deploy(CONTRACTS.bondDepo, {
      from: deployer,
      log: true,
      args,
    });
  } catch (error) {
    console.log(error);
  }
};

export default func;
func.tags = [CONTRACTS.bondDepo];
func.dependencies = [CONTRACTS.authority, CONTRACTS.treasury, CONTRACTS.theoToken, CONTRACTS.sTheo, CONTRACTS.staking];
