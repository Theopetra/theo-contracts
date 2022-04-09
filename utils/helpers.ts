import { ethers } from 'hardhat';

import {
  TheopetraBondDepository,
  StakingDistributor,
  WhitelistTheopetraBondDepository,
  AggregatorMockETH,
  AggregatorMockUSDC,
  TheopetraStaking,
  StakingMock,
  TheopetraERC20Token,
  TheopetraERC20Mock
} from '../typechain-types';
import { CONTRACTS, MOCKS, MOCKSWITHARGS, TESTWITHMOCKS } from './constants';

export async function getContracts(currentContract?: string): Promise<any> {
  const isWithMocks = process.env.NODE_ENV === TESTWITHMOCKS;
  return {
    TheopetraAuthority: await ethers.getContract(CONTRACTS.authority),
    YieldReporter: await ethers.getContract(CONTRACTS.yieldReporter),
    BondDepository: <TheopetraBondDepository>await ethers.getContract(CONTRACTS.bondDepo),
    sTheo:
      isWithMocks && currentContract !== CONTRACTS.sTheo
        ? await ethers.getContract(MOCKS.sTheoMock)
        : await ethers.getContract(CONTRACTS.sTheo),
    Staking:
      isWithMocks && currentContract !== CONTRACTS.staking
        ? <StakingMock>await ethers.getContract(MOCKSWITHARGS.stakingMock)
        : <TheopetraStaking>await ethers.getContract(CONTRACTS.staking),
    TheopetraERC20Token:
      isWithMocks && currentContract !== CONTRACTS.theoToken
        ? <TheopetraERC20Mock>await ethers.getContract(MOCKS.theoTokenMock)
        : <TheopetraERC20Token>await ethers.getContract(CONTRACTS.theoToken),
    Treasury:
      isWithMocks && currentContract !== CONTRACTS.treasury
        ? await ethers.getContract(MOCKSWITHARGS.treasuryMock)
        : await ethers.getContract(CONTRACTS.treasury),
    UsdcTokenMock: await ethers.getContract(MOCKS.usdcTokenMock),
    WETH9: await ethers.getContract(MOCKS.WETH9),
    BondingCalculatorMock: await ethers.getContract(MOCKSWITHARGS.bondingCalculatorMock),
    Distributor: <StakingDistributor>await ethers.getContract(CONTRACTS.distributor),
    WhitelistBondDepository: <WhitelistTheopetraBondDepository>await ethers.getContract(CONTRACTS.whitelistBondDepo),
    AggregatorMockETH: <AggregatorMockETH>await ethers.getContract(MOCKS.aggregatorMockETH),
    AggregatorMockUSDC: <AggregatorMockUSDC>await ethers.getContract(MOCKS.aggregatorMockUSDC),
  };
}
