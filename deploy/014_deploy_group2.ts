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
    const Treasury = await deployments.get(CONTRACTS.treasury);
    const TheopetraERC20Token = await deployments.get(CONTRACTS.theoToken);
    const sTheoToken = await deployments.get(CONTRACTS.sTheo);
    // Deploy sTHEO
    await deploy(CONTRACTS.sTheo, {
      from: deployer,
      log: true,
      args: [TheopetraAuthority.address],
    });

    // Deploy Unlocked Staking Tranche
    const stakingTerm = 0;
    const epochLength = 8 * 60 * 60;
    const firstEpochNumber = '1';
    const currentBlock = await ethers.provider.send('eth_blockNumber', []);
    const blockTimestamp = (await ethers.provider.getBlock(currentBlock)).timestamp;
    const firstEpochTime = blockTimestamp + epochLength;

    const stakingArgs = [
      TheopetraERC20Token.address,
      sTheoToken.address,
      epochLength,
      firstEpochNumber,
      firstEpochTime,
      stakingTerm,
      TheopetraAuthority.address,
      Treasury.address,
    ];

    await deploy(CONTRACTS.staking, {
      from: deployer,
      log: true,
      args: stakingArgs,
    });

    // Deploy Whitelist Bond Depository
    const Staking = await deployments.get(CONTRACTS.staking);

    const whitelistBondDepoArgs = [
      TheopetraAuthority.address,
      TheopetraERC20Token.address,
      sTheoToken.address,
      Staking.address,
      Treasury.address,
    ];

    await deploy(CONTRACTS.whitelistBondDepo, {
      from: deployer,
      log: true,
      args: whitelistBondDepoArgs,
    });

    // Deploy Public Pre-List Bond Depository
    const publicPreListArgs = [
      TheopetraAuthority.address,
      TheopetraERC20Token.address,
      sTheoToken.address,
      Staking.address,
      Treasury.address,
    ];

    await deploy(CONTRACTS.publicPreListBondDepo, {
      from: deployer,
      log: true,
      args: publicPreListArgs,
    });

    // Deploy Public Bond Depository
    const bondDepoArgs = [
      TheopetraAuthority.address,
      TheopetraERC20Token.address,
      sTheoToken.address,
      Staking.address,
      Treasury.address,
    ];

    await deploy(CONTRACTS.bondDepo, {
      from: deployer,
      log: true,
      args: bondDepoArgs,
    });

    console.log('Deployed Group 2: Bond Depository Contracts, Unlocked Staking tranche, and sTHEO ✅');
  } catch (error) {
    console.log(error);
  }
};

func.tags = ['grouptwo'];

export default func;
