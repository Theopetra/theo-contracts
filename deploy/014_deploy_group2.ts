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
    const FounderVesting = await deployments.get(CONTRACTS.founderVesting);
    // Deploy sTHEO
    await deploy(CONTRACTS.sTheo, {
      from: deployer,
      log: true,
      args: [TheopetraAuthority.address],
    });

    const sTheoToken = await deployments.get(CONTRACTS.sTheo);
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

    const Staking = await deployments.get(CONTRACTS.staking);
    const bondDepoArgs = [
      TheopetraAuthority.address,
      TheopetraERC20Token.address,
      sTheoToken.address,
      Staking.address,
      Treasury.address,
    ];
    // Deploy Whitelist Bond Depository
    await deploy(CONTRACTS.whitelistBondDepo, {
      from: deployer,
      log: true,
      args: bondDepoArgs,
    });

    // Deploy Public Pre-List Bond Depository
    await deploy(CONTRACTS.publicPreListBondDepo, {
      from: deployer,
      log: true,
      args: bondDepoArgs,
    });

    // Deploy Public Bond Depository
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

    // Add WETH address (for WETH Helper) and performanceTokenAddress (for Mock Bonding Calculator), depending on network
    let performanceTokenAddress: any;
    if (chainId === '1337') {
      const { WETH9 } = await getNamedMockAddresses(hre);
      wethHelperArgs.unshift(WETH9);
      performanceTokenAddress = (await deployments.get(MOCKS.usdcTokenMock))?.address;
    } else if (chainId === '4') {
      // Rinkeby network WETH address
      wethHelperArgs.unshift('0xc778417E063141139Fce010982780140Aa0cD5Ab');
      performanceTokenAddress = '0x4DBCdF9B62e891a7cec5A2568C3F4FAF9E8Abe2b'; // Rinkeby USDC token address
    } else if (chainId === '3') {
      // Ropsten network WETH address
      wethHelperArgs.unshift('0xc778417E063141139Fce010982780140Aa0cD5Ab');
      performanceTokenAddress = '0x07865c6E87B9F70255377e024ace6630C1Eaa37F'; // Ropsten USDC token address
    } else if (chainId === '5') {
      // Goerli network WETH address
      wethHelperArgs.unshift('0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6');
      performanceTokenAddress = '0xD87Ba7A50B2E7E660f678A895E4B72E7CB4CCd9C' // Goerli USDC token address
    } else if (chainId === '1') {
      // Mainnet WETH address
      wethHelperArgs.unshift('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
      performanceTokenAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // Mainnet USDC token address
    }

    // Deploy WETH Helper
    await deploy(CONTRACTS.WethHelper, {
      from: deployer,
      log: true,
      args: wethHelperArgs,
    });

    // Deploy Mock Bonding Calculator
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
