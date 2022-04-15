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
  founderVesting: 'TheopetraFounderVesting',
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

export const FDVTARGET = 100_000_000; // in dollars
export const CAPTABLE = {
  addresses: [
    '0x0000000000000000000000000000000000000001',
    '0x0000000000000000000000000000000000000002',
    '0x0000000000000000000000000000000000000003',
    '0x0000000000000000000000000000000000000004',
    '0x0000000000000000000000000000000000000005',
    '0x0000000000000000000000000000000000000006',
    '0x0000000000000000000000000000000000000007',
    '0x0000000000000000000000000000000000000008',
  ],
  shares: [
    10_000_000, // 1%
    5_000_000, // 0.5%
    1_000_000, // 0.1%
    500_000, // 0.05%
    100_000, // 0.01%
    50_000, // 0.005%
    10_000, // 0.001%
    5_000,  // 0.0005%
  ]
}
