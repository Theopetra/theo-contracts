import { ethers } from 'hardhat';

import { TheopetraBondDepository } from '../typechain-types';
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
        ? await ethers.getContract(MOCKSWITHARGS.stakingMock)
        : await ethers.getContract(CONTRACTS.staking),
    TheopetraERC20Token:
      isWithMocks && currentContract !== CONTRACTS.theoToken
        ? await ethers.getContract(MOCKS.theoTokenMock)
        : await ethers.getContract(CONTRACTS.theoToken),
    Treasury:
      isWithMocks && currentContract !== CONTRACTS.treasury
        ? await ethers.getContract(MOCKSWITHARGS.treasuryMock)
        : await ethers.getContract(CONTRACTS.treasury),
    UsdcTokenMock: await ethers.getContract(MOCKS.usdcTokenMock),
    WETH9: await ethers.getContract(MOCKS.WETH9),
    BondingCalculatorMock: await ethers.getContract(MOCKSWITHARGS.bondingCalculatorMock),
  };
}
