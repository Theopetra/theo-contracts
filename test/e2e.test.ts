import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts, network } from 'hardhat';
import { setupUsers, performanceUpdate, waitFor, moveTimeForward, randomIntFromInterval } from './utils';
import { getContracts } from '../utils/helpers';
import { CONTRACTS } from '../utils/constants';

import {
  BondingCalculatorMock,
  StakingMock,
  TheopetraAuthority,
  TheopetraBondDepository,
  TheopetraStaking,
  UsdcERC20Mock,
  WETH9,
  YieldReporterMock,
  TheopetraYieldReporter,
  WhitelistTheopetraBondDepository,
  STheopetra,
  TheopetraTreasury,
  TheopetraERC20Token,
  AggregatorMockUSDC,
  SignerHelper__factory,
} from '../typechain-types';

const setup = deployments.createFixture(async function () {
  await deployments.fixture();
  const { deployer: owner } = await getNamedAccounts();

  const contracts = await getContracts();

  const users = await setupUsers(await getUnnamedAccounts(), contracts);
  return {
    ...contracts,
    users,
    owner,
  };
});

describe.only('a single user: whitelist bonding with USDC and redeeming for THEO', function () {
  const buffer = 2e5;
  const capacity = '10000000000000000'; // 1e16 Could be increased (or decreased) if necessary when creating a market, to allow a larger (or smaller) maxDebt (which can act as a circuit breaker)
  const fixedBondPrice = 10e9; // 10 USD per THEO (9 decimals)
  const capacityInQuote = false;
  const depositInterval = 60 * 60 * 24 * 30; // Could be changed if needed when creating a market, to adjust maxPayout (capacity available during a deposit interval)
  const fixedTerm = true;
  const vesting = 60 * 60 * 24 * 182;
  const timeToConclusion = 60 * 60 * 24 * 365;

  let WhitelistBondDepository: WhitelistTheopetraBondDepository;
  let TheopetraAuthority: TheopetraAuthority;
  let TheopetraERC20Token: TheopetraERC20Token;
  let Staking: TheopetraStaking;
  let sTheo: STheopetra;
  let UsdcTokenMock: UsdcERC20Mock;
  let AggregatorMockUSDC: AggregatorMockUSDC;

  let Treasury: TheopetraTreasury;
  let users: any;
  let signature: any;

  beforeEach(async function () {
    ({
      WhitelistBondDepository,
      TheopetraAuthority,
      TheopetraERC20Token,
      Staking,
      sTheo,
      UsdcTokenMock,
      Treasury,
      AggregatorMockUSDC,
      users,
    } = await setup());
    const [, , bob] = users;
    const block = await ethers.provider.getBlock('latest');
    const conclusion = block.timestamp + timeToConclusion;

    // Deposit / mint quote tokens and approve transfer for WhitelistBondDepository, to allow deposits
    await UsdcTokenMock.mint(bob.address, 100_000_000_000); // 100_000 USDC (6 decimals for USDC)

    // TONOTE
    // await bob.UsdcTokenMock.approve(WhitelistBondDepository.address, LARGE_APPROVAL);

    // Setup to mint initial amount of THEO
    const [, treasurySigner] = await ethers.getSigners();
    await TheopetraAuthority.pushVault(treasurySigner.address, true); //
    await TheopetraERC20Token.connect(treasurySigner).mint(WhitelistBondDepository.address, '10000000000000000'); // 1e16
    await TheopetraAuthority.pushVault(Treasury.address, true); // Restore Treasury contract as Vault

    await WhitelistBondDepository.create(
      UsdcTokenMock.address,
      AggregatorMockUSDC.address,
      [capacity, fixedBondPrice],
      [capacityInQuote, fixedTerm],
      [vesting, conclusion]
    );
  });

  async function setupForDeposit() {
    const [governorWallet] = await ethers.getSigners();
    const [, , bob] = users;

    // Deploy SignerHelper contract
    const signerHelperFactory = new SignerHelper__factory(governorWallet);
    const SignerHelper = await signerHelperFactory.deploy();
    // Create a hash in the same way as created by Signed contract
    const bobHash = await SignerHelper.createHash(
      'somedata',
      bob.address,
      WhitelistBondDepository.address,
      'supersecret'
    );

    // Set the secret on the Signed contract
    await WhitelistBondDepository.setSecret('supersecret');

    // 32 bytes of data in Uint8Array
    const messageHashBinary = ethers.utils.arrayify(bobHash);

    // To sign the 32 bytes of data, pass in the data
    signature = await governorWallet.signMessage(messageHashBinary);
  }

  it('allows a whitelisted user to bond and redeem the bond for THEO', async function () {
    const [, , bob] = users;
    const initialBalance = await bob.TheopetraERC20Token.balanceOf(bob.address);
    expect(await WhitelistBondDepository.isLive(0)).to.equal(true);
    await setupForDeposit();

    // Deposit requires a maxPrice. For this, the current value (with 9 decimals) of THEO per USDC can be determined
    const usdcPerTheo = (await WhitelistBondDepository.calculatePrice(0)).toNumber();
    expect(usdcPerTheo).to.be.greaterThan(fixedBondPrice * 0.997); // Allow for some difference owing to USDC not being exactly 1 USD per USDC
    expect(usdcPerTheo).to.be.lessThan(fixedBondPrice * 1.003);
    const usdcDepositAmount = 100_000_000; // // 1e8, equivalent to 100 USDC (6 decimals for USDC)

    await bob.UsdcTokenMock.approve(WhitelistBondDepository.address, usdcDepositAmount);

    // User Bonds by making a deposit in the market
    await bob.WhitelistBondDepository.deposit(0, usdcDepositAmount, usdcPerTheo, bob.address, bob.address, signature);

    // Get indexes of all pending notes for the user. The user should have one pending note, owing to their deposit
    const bobNotesIndexes = await WhitelistBondDepository.indexesFor(bob.address);
    expect(bobNotesIndexes.length).to.equal(1);

    await moveTimeForward(vesting * 1.5);

    await WhitelistBondDepository.redeemAll(bob.address);
    const finalBalance = await bob.TheopetraERC20Token.balanceOf(bob.address);
    expect(finalBalance.toNumber()).to.be.greaterThan(initialBalance.toNumber());
    const expectedBalance = Math.floor((((usdcDepositAmount / 10 ** 6) * 10 ** 9) / usdcPerTheo) * 10 ** 9);
    expect(finalBalance.toNumber()).to.equal(expectedBalance);
  });
});

describe.only('bonding with USDC, redeeming to staked THEO (sTHEO or pTHEO) and receiving rebase rewards', function () {
  const bid = 0;
  const buffer = 2e5;
  const capacity = '10000000000000000'; // 1e16
  const capacityInQuote = false;
  const depositAmount = '100000000'; // 1e8, equivalent to 100 USDC (6 decimals for USDC)
  const depositInterval = 60 * 60 * 24 * 30;
  const fixedTerm = true;
  const initialPrice = 400e9;
  const LARGE_APPROVAL = '100000000000000000000000000000000';
  const timeToConclusion = 60 * 60 * 24 * 180; // seconds in 180 days
  const tuneInterval = 60 * 60;
  const vesting = 60 * 60 * 24 * 14; // seconds in 14 days
  // Initial mint for Mock USDC
  const initialMint = '10000000000000000000000000';
  const bondRateFixed = 10_000_000; // 1% in decimal form (i.e. 0.01 with 9 decimals)
  const maxBondRateVariable = 40_000_000; // 4% in decimal form (i.e. 0.04 with 9 decimals)
  const discountRateBond = 10_000_000; // 1% in decimal form (i.e. 0.01 with 9 decimals)
  const discountRateYield = 20_000_000; // 2% in decimal form (i.e. 0.02 with 9 decimals)

  let block: any;
  let BondDepository: TheopetraBondDepository;
  let BondingCalculatorMock: BondingCalculatorMock;
  let conclusion: number;
  let Staking: any;
  let sTheo: any;
  let TheopetraAuthority: TheopetraAuthority;
  let TheopetraERC20Token: any;
  let Treasury: any;
  let UsdcTokenMock: UsdcERC20Mock;
  let users: any;
  let WETH9: WETH9;
  let YieldReporter: TheopetraYieldReporter | YieldReporterMock;

  beforeEach(async function () {
    ({
      BondDepository,
      BondingCalculatorMock,
      Staking,
      sTheo,
      TheopetraAuthority,
      TheopetraERC20Token,
      Treasury,
      UsdcTokenMock,
      users,
      YieldReporter,
    } = await setup());

    const [, , bob] = users;
    block = await ethers.provider.getBlock('latest');
    conclusion = block.timestamp + timeToConclusion;

    // Setup to mint initial amount of THEO
    const [, treasurySigner] = await ethers.getSigners();
    await TheopetraAuthority.pushVault(treasurySigner.address, true); // Use a valid signer for Vault
    await TheopetraERC20Token.connect(treasurySigner).mint(BondDepository.address, '1000000000000000000000000'); // 1e24 Set high to allow for tests with very large deposits
    await TheopetraAuthority.pushVault(Treasury.address, true); // Restore Treasury contract as Vault

    // Update bob's balance to allow very large deposits
    await network.provider.send('hardhat_setBalance', [
      bob.address,
      '0x52B7D2DCC80CD2E4000000', // 1e26
    ]);

    // Mint quote tokens and approve transfer for the Bond Depository, to allow deposits
    await UsdcTokenMock.mint(bob.address, initialMint);
    await bob.UsdcTokenMock.approve(BondDepository.address, LARGE_APPROVAL);

    await BondDepository.create(
      UsdcTokenMock.address,
      [capacity, initialPrice, buffer],
      [capacityInQuote, fixedTerm],
      [vesting, conclusion],
      [bondRateFixed, maxBondRateVariable, discountRateBond, discountRateYield],
      [depositInterval, tuneInterval]
    );
    expect(await BondDepository.isLive(bid)).to.equal(true);

    // Setup for successful calls to `marketPrice` (during `deposit`) when test use wired-up contracts
    await performanceUpdate(Treasury, YieldReporter, BondingCalculatorMock.address);

    // Set the address of the bonding calculator
    await Treasury.setTheoBondingCalculator(BondingCalculatorMock.address);
  });

  it.only('allows a single user to bond, redeem for sTHEO and unstake for THEO, with rebase rewards', async function () {
    const [, , bob] = users;
    const autoStake = true;

    // Deposit requires a maxPrice. For this, the current value (with 9 decimals) of THEO per USDC can be determined
    const usdcPerTheo = (await BondDepository.marketPrice(0)).toNumber();

    const [expectedPayout] = await bob.BondDepository.callStatic.deposit(
      bid,
      depositAmount,
      usdcPerTheo,
      bob.address,
      bob.address,
      autoStake
    );

    // Bond: user makes deposit in the market
    await bob.BondDepository.deposit(bid, depositAmount, usdcPerTheo, bob.address, bob.address, autoStake);
    const bobNotesIndexes = await BondDepository.indexesFor(bob.address);

    expect(bobNotesIndexes.length).to.equal(1);

    const additionalTimeProportion = randomIntFromInterval(100, 500) / 100;
    await moveTimeForward(vesting * additionalTimeProportion);

    // Redeem for sTHEO
    await BondDepository.redeemAll(bob.address);
    const sTheoBalance = await sTheo.balanceOf(bob.address);
    expect(sTheoBalance).to.equal(expectedPayout);


  });
});
