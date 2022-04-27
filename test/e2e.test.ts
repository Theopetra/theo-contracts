import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts, network } from 'hardhat';
import { setupUsers, performanceUpdate, waitFor, moveTimeForward, randomIntFromInterval } from './utils';
import { getContracts } from '../utils/helpers';
import { CONTRACTS } from '../utils/constants';

import {
  BondingCalculatorMock,
  TheopetraAuthority,
  TheopetraBondDepository,
  TheopetraStaking,
  UsdcERC20Mock,
  TheopetraYieldReporter,
  WhitelistTheopetraBondDepository,
  STheopetra,
  TheopetraTreasury,
  TheopetraERC20Token,
  AggregatorMockUSDC,
  SignerHelper__factory,
  StakingDistributor,
  PTheopetra,
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

describe('a single user: whitelist bonding with USDC and redeeming for THEO', function () {
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
  const initialPrice = 400e9; // This value could be changed to adjust targetDebt (and thereby maxPayout and maxDebt) if desired
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
  const lockedStakingTerm = 31536000;

  let block: any;
  let BondDepository: TheopetraBondDepository;
  let BondingCalculatorMock: BondingCalculatorMock;
  let conclusion: number;
  let Staking: TheopetraStaking;
  let StakingLocked: TheopetraStaking;
  let sTheo: STheopetra;
  let pTheo: PTheopetra;
  let TheopetraAuthority: TheopetraAuthority;
  let TheopetraERC20Token: TheopetraERC20Token;
  let Treasury: TheopetraTreasury;
  let UsdcTokenMock: UsdcERC20Mock;
  let users: any;
  let YieldReporter: TheopetraYieldReporter;
  let Distributor: StakingDistributor;

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
      Distributor,
      StakingLocked,
      pTheo,
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

    await bob.TheopetraERC20Token.approve(Staking.address, LARGE_APPROVAL);
    await bob.TheopetraERC20Token.approve(StakingLocked.address, LARGE_APPROVAL);
  });

  async function reportYields() {
    // Report a couple of yields using the Yield Reporter (for use when calculating deltaTreasuryYield)
    const lastYield = 50_000_000_000;
    const currentYield = 150_000_000_000;
    await waitFor(YieldReporter.reportYield(lastYield));
    await waitFor(YieldReporter.reportYield(currentYield));
    // set the address of the mock bonding calculator
    await Treasury.setTheoBondingCalculator(BondingCalculatorMock.address);
    // Move forward 8 hours to allow tokenPerformanceUpdate to update contract state
    // current token price will subsequently be updated, last token price will still be zero
    await moveTimeForward(60 * 60 * 8);
    await Treasury.tokenPerformanceUpdate();
    // Move forward in time again to update again, this time current token price becomes last token price
    await moveTimeForward(60 * 60 * 8);
    await Treasury.tokenPerformanceUpdate();
  }

  async function setupForRebaseUnlocked() {
    const expectedStartRateUnlocked = 40_000_000; // 4%, rateDenominator for Distributor is 1_000_000_000;
    const expectedDrs = 10_000_000; // 1%
    const expectedDys = 20_000_000; // 2%
    const isLocked = false;
    // Setup for Distributor
    await Distributor.addRecipient(Staking.address, expectedStartRateUnlocked, expectedDrs, expectedDys, isLocked);

    await reportYields();
  }

  async function setupForRebaseLocked() {
    const expectedStartRateUnlocked = 120_000_000; // 12%, rateDenominator for Distributor is 1_000_000_000;
    const expectedDrs = 30_000_000; // 3%
    const expectedDys = 40_000_000; // 4%
    const isLocked = true;
    // Setup for Distributor
    await Distributor.addRecipient(
      StakingLocked.address,
      expectedStartRateUnlocked,
      expectedDrs,
      expectedDys,
      isLocked
    );

    await reportYields();
  }

  it('allows a single user to bond, redeem for sTHEO and unstake for THEO, with rebase rewards', async function () {
    const [, , bob] = users;
    const autoStake = true;
    await setupForRebaseUnlocked();

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

    // Move past the end of the vesting period to allow note to be redeemed
    const additionalTimeProportion = randomIntFromInterval(100, 500) / 100;
    await moveTimeForward(vesting * additionalTimeProportion);

    // Redeem for sTHEO
    await BondDepository.redeemAll(bob.address);
    const sTheoBalancePreRebase = await sTheo.balanceOf(bob.address);
    expect(sTheoBalancePreRebase).to.equal(expectedPayout);

    // A claim for the user contains staking information, including deposit amount
    const stakingInfo = await Staking.stakingInfo(bob.address, 0);
    expect(stakingInfo.deposit.toNumber()).to.equal(sTheoBalancePreRebase.toNumber());

    // Trigger rebases to get a non-zero profit when rebasing in sTHEO
    // and a resulting change in the user's sTHEO balance;
    await Staking.rebase();
    await moveTimeForward(60 * 60 * 8); // This movement in time is not necessary, but done to keep the test closer to a real-world implementation
    await Staking.rebase();

    // Determine the expected reward
    const currentExpectedRewards = await Staking.rewardsFor(bob.address, 0);

    // Get the balance of sTHEO available to redeem (which should in this case be equal to the user's entire sTHEO balance)
    const [, , , , gonsRemainingOne] = await Staking.stakingInfo(bob.address, 0);
    const balanceFromGons = await sTheo.balanceForGons(gonsRemainingOne);
    const sTheoBalancePostRebase = await sTheo.balanceOf(bob.address);
    expect(balanceFromGons).to.equal(sTheoBalancePostRebase);

    const preUnstakeTheoBalance = await TheopetraERC20Token.balanceOf(bob.address);

    // Unstake sTHEO (redeem for THEO)
    await bob.sTheo.approve(Staking.address, balanceFromGons);
    await bob.Staking.unstake(bob.address, [balanceFromGons], false, [0]);

    const finalTheoBalance = await TheopetraERC20Token.balanceOf(bob.address);
    expect(finalTheoBalance.sub(preUnstakeTheoBalance)).to.equal(sTheoBalancePostRebase);

    // Rewards are due only to sTHEO rebasing (no slashing rewards)
    // So rewards are the difference in sTheo balance before and after rebasing
    const rewardsEarned = sTheoBalancePostRebase.sub(sTheoBalancePreRebase);
    expect(rewardsEarned).to.equal(currentExpectedRewards);
  });

  it.only('allows a single user to bond and (after redeeming the bonding note for THEO) enter locked staking, then to unstake pTHEO for THEO with rebase rewards', async function () {
    const [, , bob] = users;

    // Set autostake to false to redeem for THEO rather than sTHEO
    // For test involving autostake === true, see the previous test
    const autoStake = false;
    await setupForRebaseLocked();

    const initialTheoBalance = await TheopetraERC20Token.balanceOf(bob.address);

    // Deposit requires a maxPrice. For this, the current value (with 9 decimals) of THEO per USDC can be determined
    const usdcPerTheo = (await BondDepository.marketPrice(0)).toNumber();
    // Bond: user makes deposit in the market
    await bob.BondDepository.deposit(bid, depositAmount, usdcPerTheo, bob.address, bob.address, autoStake);

    // Move past the end of the vesting period to allow note to be redeemed
    const additionalTimeProportion = randomIntFromInterval(100, 500) / 100;
    await moveTimeForward(vesting * additionalTimeProportion);

    // Redeem bonding note for THEO
    await BondDepository.redeemAll(bob.address);
    const postBondRedeemTheoBalance = await TheopetraERC20Token.balanceOf(bob.address);

    expect(postBondRedeemTheoBalance.toNumber()).to.be.greaterThan(initialTheoBalance.toNumber());

    // Stake THEO for pTHEO (immediate claim, no warmup)
    const claim = true;
    await bob.StakingLocked.stake(bob.address, postBondRedeemTheoBalance, claim);

    expect(await pTheo.balanceOf(bob.address)).to.equal(postBondRedeemTheoBalance);

    const pTheoBalancePreRebase = await pTheo.balanceOf(bob.address);

    // Move time forward with regular rebasing, past the staking expiry time
    // (zero slashing penalty will be applied when unstaking)
    const timePerInterval = 60 * 60 * 24 * 7;
    const intervalsInStakingPeriod = Math.ceil(lockedStakingTerm / timePerInterval);
    for (let i = 0; i < intervalsInStakingPeriod; i++) {
      await StakingLocked.rebase();
      await moveTimeForward(timePerInterval); // This movement in time is not necessary, but done to keep the test closer to a real-world implementation
    }

    const nextExpectedRewards = await Distributor.nextRewardFor(StakingLocked.address);
    await StakingLocked.rebase();
    // Determine the expected reward
    const currentExpectedRewards = await StakingLocked.rewardsFor(bob.address, 0);

    const latestBlock = await ethers.provider.getBlock('latest');
    const stakingInfo = await StakingLocked.stakingInfo(bob.address, 0);
    expect(stakingInfo.stakingExpiry.toNumber()).to.be.lessThan(latestBlock.timestamp);
    const pTheoBalancePostRebase = await pTheo.balanceOf(bob.address);

    const amountAvailable = await pTheo.balanceForGons(stakingInfo.gonsRemaining);

    const preUnstakeTheoBalance = await TheopetraERC20Token.balanceOf(bob.address);

    // Unstake
    await bob.pTheo.approve(StakingLocked.address, amountAvailable);
    await bob.StakingLocked.unstake(bob.address, [amountAvailable], false, [0]);

    const finalTheoBalance = await TheopetraERC20Token.balanceOf(bob.address);
    expect(finalTheoBalance.sub(preUnstakeTheoBalance)).to.equal(pTheoBalancePostRebase);

    // Calculate rewards
    const rewardsEarned = pTheoBalancePostRebase.sub(pTheoBalancePreRebase);
    expect(rewardsEarned).to.equal(currentExpectedRewards);
  });
});
