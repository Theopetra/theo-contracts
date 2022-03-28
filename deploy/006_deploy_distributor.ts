import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import getNamedMockAddresses from './mocks/helpers';
import { CONTRACTS } from '../utils/constants';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  try {
    const { deployments, getChainId, getNamedAccounts } = hre;
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();
    const chainId = await getChainId();

    const TheopetraAuthority = await deployments.get(CONTRACTS.authority);

    let epochLengthInBlocks;
    let nextEpochBlock;
    let args: any = [];

    // If on Hardhat network, use the following values for testing
    if (chainId === '1337') {
      epochLengthInBlocks = '2000';
      nextEpochBlock = '10';

      const { TheopetraERC20Mock, TreasuryMock, StakingMock } = await getNamedMockAddresses(hre);
      args = [
        TreasuryMock,
        TheopetraERC20Mock,
        epochLengthInBlocks,
        nextEpochBlock,
        TheopetraAuthority.address,
        StakingMock,
      ];
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
func.dependencies = [CONTRACTS.authority];