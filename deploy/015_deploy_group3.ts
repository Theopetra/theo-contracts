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

    // Deploy pTHEO
    await deploy(CONTRACTS.pTheo, {
      from: deployer,
      log: true,
      args: [TheopetraAuthority.address],
    });

    const pTheopetraERC20 = await deployments.get(CONTRACTS.pTheo);
    console.log('DEPLOYED pTHEO at🌈', pTheopetraERC20);
    // Deploy Locked Staking Tranche
    // staking term is seconds in a year
    const stakingTerm = 31536000;
    const epochLength = 8 * 60 * 60;
    const firstEpochNumber = '1';
    const currentBlock = await ethers.provider.send('eth_blockNumber', []);
    const blockTimestamp = (await ethers.provider.getBlock(currentBlock)).timestamp;
    const firstEpochTime = blockTimestamp + epochLength;

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



    console.log('Deployed Group 3: Locked Staking Tranche, pTHEO, Staking Distributor ✅');
  } catch (error) {
    console.log(error);
  }
};

func.tags = ['groupthree'];

export default func;
