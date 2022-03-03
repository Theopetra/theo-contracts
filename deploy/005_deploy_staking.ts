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
    let firstEpochTime;

    // If on Hardhat network, use example values for testing
    if (chainId === '1337') {
      epochLengthInBlocks = '1000';
      firstEpochNumber = '800';
      firstEpochTime = '1639430907';
    }

    await deploy(CONTRACTS.staking, {
      from: deployer,
      log: true,
      args: [deployer, deployer, epochLengthInBlocks, firstEpochNumber, firstEpochTime, TheopetraAuthority.address],
    });
  } catch (error) {
    console.log(error);
  }
};

export default func;
func.tags = [CONTRACTS.staking];
func.dependencies = [CONTRACTS.authority];
