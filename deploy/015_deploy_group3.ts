import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { CONTRACTS } from '../utils/constants';
import { ethers } from 'hardhat';
import { waitFor } from '../test/utils';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  try {
    const { deployments, getNamedAccounts } = hre;
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    const TheopetraAuthority = await deployments.get(CONTRACTS.authority);
    const TheopetraERC20Token = await deployments.get(CONTRACTS.theoToken);
    const Treasury = await deployments.get(CONTRACTS.treasury);
    const StakingUnlocked = await deployments.get(CONTRACTS.staking);

    // Deploy pTHEO
    await deploy(CONTRACTS.pTheo, {
      from: deployer,
      log: true,
      args: [TheopetraAuthority.address],
    });

    // Deploy Locked Staking Tranche
    const stakingTerm = 31536000; // staking term is seconds in a year
    const epochLength = 8 * 60 * 60;
    const firstEpochNumber = '1';
    const currentBlock = await ethers.provider.send('eth_blockNumber', []);
    const blockTimestamp = (await ethers.provider.getBlock(currentBlock)).timestamp;
    const firstEpochTime = blockTimestamp + epochLength;
    const pTheopetraERC20 = await deployments.get(CONTRACTS.pTheo);
    const lockedStakingArgs = [
      TheopetraERC20Token.address,
      pTheopetraERC20.address,
      epochLength,
      firstEpochNumber,
      firstEpochTime,
      stakingTerm,
      TheopetraAuthority.address,
      Treasury.address,
    ];

    await deploy(CONTRACTS.stakingLocked, {
      from: deployer,
      log: true,
      contract: 'TheopetraStaking', // Name of artifact
      args: lockedStakingArgs,
    });


    // Deploy Staking Distributor
    const distributorEpochLength = 60 * 60 * 24 * 365;
    const distributorArgs = [
      Treasury.address,
      TheopetraERC20Token.address,
      distributorEpochLength,
      TheopetraAuthority.address,
      StakingUnlocked.address,
    ];

    await deploy(CONTRACTS.distributor, {
      from: deployer,
      log: true,
      args: distributorArgs,
    });

    console.log('Deployed Group 3: pTHEO, Locked Staking Tranche, Staking Distributor ✅');
  } catch (error) {
    console.log(error);
  }
};

func.tags = ['groupthree'];

export default func;
