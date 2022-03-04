import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { CONTRACTS } from '../utils/constants';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  try {
    const { deployments, getChainId, getNamedAccounts } = hre;
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();
    const chainId = await getChainId();

    const TheopetraAuthority = await deployments.get(CONTRACTS.authority);

    let epochLengthInBlocks;
    let firstEpochNumber;
    let firstEpochBlock;
    let args: any = [];

    // If on Hardhat network, use the following values for testing
    if (chainId === '1337') {
      epochLengthInBlocks = '2000';
      firstEpochNumber = '1';
      firstEpochBlock = '10';
      args = [deployer, deployer, epochLengthInBlocks, firstEpochNumber, firstEpochBlock, TheopetraAuthority.address];
    }

    await deploy(CONTRACTS.staking, {
      from: deployer,
      log: true,
      args,
    });
  } catch (error) {
    console.log(error);
  }
};

export default func;
func.tags = [CONTRACTS.staking];
func.dependencies = [CONTRACTS.authority];
