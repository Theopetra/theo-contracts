import hre from 'hardhat';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import getNamedMockAddresses from './mocks/helpers';
import { CONTRACTS, TESTFULL } from '../utils/constants';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  try {
    const { deployments, getChainId, getNamedAccounts } = hre;
    const { deploy } = deployments;

    const TheopetraAuthority = await deployments.get(CONTRACTS.authority);
    const { deployer } = await getNamedAccounts();
    const chainId = await getChainId();
    const args = [TheopetraAuthority.address, deployer, deployer, deployer, deployer];

    if (chainId === '1337' && process.env.NODE_ENV === TESTFULL) {
      const TheopetraERC20Token = await deployments.get(CONTRACTS.theoToken);
      const TheopetraTreasury = await deployments.get(CONTRACTS.treasury);
      const sTheopetraERC20 = await deployments.get(CONTRACTS.sTheo);
      const Staking = await deployments.get(CONTRACTS.staking);

      args.splice(1, 4, TheopetraERC20Token.address, sTheopetraERC20.address, Staking.address, TheopetraTreasury.address);

    } else if (chainId === '1337') {
      const { TheopetraERC20Mock, sTheoMock, StakingMock, TreasuryMock } = await getNamedMockAddresses(hre);
      args.splice(1, 4, TheopetraERC20Mock, sTheoMock, StakingMock, TreasuryMock);
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
func.dependencies = hre?.network?.config?.chainId === 1337 ? [CONTRACTS.authority, CONTRACTS.treasury, CONTRACTS.theoToken, CONTRACTS.sTheo, CONTRACTS.staking, 'Mocks'] : [CONTRACTS.authority];
