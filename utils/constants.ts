export const CONTRACTS: Record<string, string> = {
  authority: 'TheopetraAuthority',
  theoToken: 'TheopetraERC20Token',
  bondDepo: 'TheopetraBondDepository',
  staking: 'TheopetraStaking',
  sTheo: 'sTheopetra',
  distributor: 'StakingDistributor',
  treasury: 'TheopetraTreasury',
  whitelistBondDepo: 'WhitelistTheopetraBondDepository',
  yieldReporter: 'TheopetraYieldReporter',
  pTheo: 'pTheopetra',
};

export const MOCKS: Record<string, string> = {
  theoTokenMock: 'TheopetraERC20Mock',
  usdcTokenMock: 'UsdcERC20Mock',
  sTheoMock: 'sTheoMock',
  WETH9: 'WETH9',
  yieldReporterMock: 'YieldReporterMock',
  aggregatorMockETH: 'AggregatorMockETH',
  aggregatorMockUSDC: 'AggregatorMockUSDC',
};

export const MOCKSWITHARGS: Record<string, string> = {
  treasuryMock: 'TreasuryMock',
  stakingMock: 'StakingMock',
  bondingCalculatorMock: 'BondingCalculatorMock',
};

export const TESTWITHMOCKS = 'test-with-mocks';
