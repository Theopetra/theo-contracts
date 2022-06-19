import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { CONTRACTS, MOCKS } from '../utils/constants';
import { ethers } from 'hardhat';
import { waitFor } from '../test/utils';
import getNamedMockAddresses from './mocks/helpers';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  try {
    const { deployments, getNamedAccounts, getChainId } = hre;
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();
    const chainId = await getChainId();

    const TheopetraAuthority = await deployments.get(CONTRACTS.authority);
    const Treasury = await deployments.get(CONTRACTS.treasury);
    const TheopetraERC20Token = await deployments.get(CONTRACTS.theoToken);
    const sTheoToken = await deployments.get(CONTRACTS.sTheo);
    const FounderVesting = await deployments.get(CONTRACTS.founderVesting);
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

    // Deploy WETH helper
    const TheopetraBondDepository = await deployments.get(CONTRACTS.bondDepo);
    const WhitelistTheopetraBondDepository = await deployments.get(CONTRACTS.whitelistBondDepo);

    const wethHelperArgs = [
      TheopetraAuthority.address,
      TheopetraBondDepository.address,
      WhitelistTheopetraBondDepository.address,
    ];

    // Add WETH address, depending on network
    if (chainId === '1337') {
      const { WETH9 } = await getNamedMockAddresses(hre);
      wethHelperArgs.unshift(WETH9);
    } else if (chainId === '4') {
      // Rinkeby network WETH address
      wethHelperArgs.unshift('0xc778417E063141139Fce010982780140Aa0cD5Ab');
    } else if (chainId === '3') {
      // Ropsten network WETH address
      wethHelperArgs.unshift('0xc778417E063141139Fce010982780140Aa0cD5Ab');
    } else if (chainId === '1') {
      // Mainnet WETH address
      wethHelperArgs.unshift('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
    }

    await deploy(CONTRACTS.WethHelper, {
      from: deployer,
      log: true,
      args: wethHelperArgs,
    });

    // Deploy Mock Bonding Calculator
    let performanceTokenAddress: any;
    if (chainId === '1337') {
      performanceTokenAddress = (await deployments.get(MOCKS.usdcTokenMock))?.address;
    } else if (chainId === '4') {
      performanceTokenAddress = '0x4DBCdF9B62e891a7cec5A2568C3F4FAF9E8Abe2b'; // Rinkeby USDC token address
    } else if (chainId === '3') {
      performanceTokenAddress = '0x07865c6E87B9F70255377e024ace6630C1Eaa37F'; // Ropsten USDC token address
    }

    const mockBondingCalculatorArgs = [
      TheopetraERC20Token.address,
      TheopetraAuthority.address,
      performanceTokenAddress,
      FounderVesting.address,
    ];

    await deploy('NewBondingCalculatorMock', {
      from: deployer,
      log: true,
      args: mockBondingCalculatorArgs,
    });

    console.log(
      'Deployed Group 2: Bond Depository Contracts, WETH Helper, Mock Bonding Calculator, Unlocked Staking tranche, and sTHEO ✅'
    );
  } catch (error) {
    console.log(error);
  }
};

func.tags = ['grouptwo'];

export default func;
