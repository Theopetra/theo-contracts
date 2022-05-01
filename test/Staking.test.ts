import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';
import { BigNumber } from 'ethers';

import { setupUsers, moveTimeForward, randomIntFromInterval, waitFor, decodeLogs } from './utils';
import { getContracts } from '../utils/helpers';
import { CONTRACTS, TESTWITHMOCKS } from '../utils/constants';
import {
  StakingDistributor,
  TheopetraAuthority,
  TheopetraStaking,
} from '../typechain-types';

const setup = deployments.createFixture(async () => {
  await deployments.fixture();
  const { deployer: owner } = await getNamedAccounts();

  const contracts = { ...(await getContracts(CONTRACTS.staking)) };

  // Rename contracts to simplify updates to existing tests.
  // Updates as follows (new for old):
  // `StakingUnlocked` for unlocked tranche,
  // `Staking` for locked tranche
  // `sTheoUnlocked` for `sTheo`
  // `sTheo` for `pTheo`
  contracts['StakingUnlocked'] = contracts['Staking'];
  delete contracts['Staking'];
  contracts['Staking'] = contracts['StakingLocked'];
  delete contracts['StakingLocked'];
  contracts['sTheoUnlocked'] = contracts['sTheo'];
  delete contracts['sTheo'];
  contracts['sTheo'] = contracts['pTheo'];
  delete contracts['pTheo'];

  const users = await setupUsers(await getUnnamedAccounts(), contracts);

  return {
    ...contracts,
    users,
    owner,
    addressZero: ethers.utils.getAddress('0x0000000000000000000000000000000000000000'),
  };
});

describe('Staking', function () {
  const amountToStake = 1_000_000_000_000;
  const LARGE_APPROVAL = '100000000000000000000000000000000';
  const epochLength = 8 * 60 * 60; // Same value as used in deployment script for Hardhat network deployment
  const firstEpochNumber = 1; // Same value as used in deployment script for Hardhat network deployment
  const unlockedStakingTerm = 0;
  const lockedStakingTerm = 31536000;

  let Staking: TheopetraStaking;
  let StakingUnlocked: TheopetraStaking;
  let Distributor: StakingDistributor;
  let sTheo: any;
  let sTheoUnlocked: any;
  let TheopetraAuthority: TheopetraAuthority;
  let TheopetraERC20Token: any;
  let Treasury: any;
  let YieldReporter: any;
  let BondingCalculatorMock: any;
  let users: any;
  let owner: any;
  let addressZero: any;

  async function createClaim(amount: number = amountToStake, claim = false, isLockedTranche = true) {
    const [, bob] = users;

    isLockedTranche
      ? await bob.Staking.stake(bob.address, amount, claim)
      : await bob.StakingUnlocked.stake(bob.address, amount, claim);
  }

  async function setupForRebase() {
    const expectedStartRateLocked = 120_000_000; // 12%, rateDenominator for Distributor is 1_000_000_000;
    const expectedDrs = 10_000_000; // 1%
    const expectedDys = 20_000_000; // 2%
    const isLocked = false;

    // Setup for Distributor
    await Distributor.addRecipient(Staking.address, expectedStartRateLocked, expectedDrs, expectedDys, isLocked);
    await Distributor.addRecipient(
      StakingUnlocked.address,
      expectedStartRateLocked,
      expectedDrs,
      expectedDys,
      isLocked
    );
    // Report a couple of yields using the Yield Reporter (for use when calculating deltaTreasuryYield)
    const lastYield = 50_000_000_000;
    const currentYield = 150_000_000_000;
    await waitFor(YieldReporter.reportYield(lastYield));
    await waitFor(YieldReporter.reportYield(currentYield));

    // Move forward 8 hours to allow tokenPerformanceUpdate to update contract state
    // current token price will subsequently be updated, last token price will still be zero
    await moveTimeForward(60 * 60 * 8);
    await Treasury.tokenPerformanceUpdate();
    // Move forward in time again to update again, this time current token price becomes last token price
    await moveTimeForward(60 * 60 * 8);
    await Treasury.tokenPerformanceUpdate();
  }

  beforeEach(async function () {
    ({
      Staking, // Locked Tranche (renamed from `StakingLocked` during setup)
      StakingUnlocked, // Unlocked Tranche (renamed from `Staking` during setup)
      Distributor,
      sTheo, // pTheo (renamed during setup to simplify testing updates)
      sTheoUnlocked, // sTheo (renamed during setup from `sTheo`)
      TheopetraAuthority,
      TheopetraERC20Token,
      Treasury,
      YieldReporter,
      BondingCalculatorMock,
      users,
      owner,
      addressZero,
    } = await setup());

    const [, bob, carol] = users;
    const [, treasurySigner] = await ethers.getSigners();
    if (process.env.NODE_ENV !== TESTWITHMOCKS) {
      // Setup to mint initial amount of THEO
      await TheopetraAuthority.pushVault(treasurySigner.address, true); // Use a valid signer for Vault
      await TheopetraERC20Token.connect(treasurySigner).mint(bob.address, '10000000000000000'); // 1e16 Set to be same as return value in Treasury Mock for baseSupply
      await TheopetraAuthority.pushVault(Treasury.address, true); // Restore Treasury contract as Vault

      // Additional setup for Distributor
      await Distributor.setStaking(Staking.address);
    } else {
      // Setup to mint initial amount of THEO when using mocks
      await TheopetraERC20Token.mint(bob.address, '10000000000000000');
    }
    await bob.TheopetraERC20Token.approve(Staking.address, LARGE_APPROVAL);
    await bob.TheopetraERC20Token.approve(StakingUnlocked.address, LARGE_APPROVAL);
    await carol.TheopetraERC20Token.approve(Staking.address, LARGE_APPROVAL);

    if (process.env.NODE_ENV === TESTWITHMOCKS) {
      // Mint enough to allow transfers when claiming staked THEO
      // only call this if not performing full testing, as only mock sTheo has a mint function (sTheo itself uses `initialize` instead)
      await sTheo.mint(Staking.address, '1000000000000000000000');
      await TheopetraERC20Token.mint(Staking.address, '1000000000000000000000');
    }

    // set the address of the mock bonding calculator
    await Treasury.setTheoBondingCalculator(BondingCalculatorMock.address);
  });

  /* ======== Start Locked Staking Tranche Tests ======== */

  describe('Locked Tranche', function () {
    describe('Deployment', async function () {
      it('can be deployed', async function () {
        await setup();
      });

      it('is deployed with the correct constructor arguments', async function () {
        const latestBlock = await ethers.provider.getBlock('latest');

        const expectedFirstEpochTime =
          latestBlock.timestamp + (process.env.NODE_ENV === TESTWITHMOCKS ? 60 * 60 * 24 * 30 : epochLength); // Same values as used in deployment script

        const lowerBound = expectedFirstEpochTime * 0.999;
        const upperBound = expectedFirstEpochTime * 1.001;
        expect(await Staking.THEO()).to.equal(TheopetraERC20Token.address);
        expect(await Staking.sTHEO()).to.equal(sTheo.address);

        const epoch: any = await Staking.epoch();

        expect(epoch._length).to.equal(BigNumber.from(epochLength));
        expect(epoch.number).to.equal(BigNumber.from(firstEpochNumber));
        expect(Number(epoch.end)).to.be.greaterThan(lowerBound);
        expect(Number(epoch.end)).to.be.lessThan(upperBound);
        expect(Number(await Staking.stakingTerm())).to.equal(lockedStakingTerm);
        expect(await TheopetraAuthority.governor()).to.equal(owner);
      });

      it('will revert if deployment is attempted with a zero address for THEO', async function () {
        const latestBlock = await ethers.provider.getBlock('latest');
        const blockTimestamp = latestBlock.timestamp;
        const firstEpochTime = blockTimestamp + 10000;
        await expect(
          deployments.deploy(CONTRACTS.staking, {
            from: owner,
            args: [
              addressZero,
              owner,
              epochLength,
              firstEpochNumber,
              firstEpochTime,
              lockedStakingTerm,
              TheopetraAuthority.address,
              Treasury.address,
            ],
          })
        ).to.be.revertedWith('Invalid address');
      });

      it('will revert if deployment is attempted with a zero address for sTHEO', async function () {
        const latestBlock = await ethers.provider.getBlock('latest');
        const blockTimestamp = latestBlock.timestamp;
        const firstEpochTime = blockTimestamp + 10000;
        await expect(
          deployments.deploy(CONTRACTS.staking, {
            from: owner,
            args: [
              owner,
              addressZero,
              epochLength,
              firstEpochNumber,
              firstEpochTime,
              lockedStakingTerm,
              TheopetraAuthority.address,
              Treasury.address,
            ],
          })
        ).to.be.revertedWith('Invalid address');
      });
    });

    describe('setContract', function () {
      it('should allow the manager to set a contract address for LP staking', async function () {
        const [, alice] = users;
        await Staking.setContract(0, alice.address); // set distributor
        expect(await Staking.distributor()).to.equal(alice.address);
      });

      it('should revert if called by an address other than the manager', async function () {
        const [, alice] = users;
        await expect(alice.Staking.setContract(0, alice.address)).to.be.revertedWith('UNAUTHORIZED');
      });
    });

    describe('Warmup', function () {
      it('should have a warmup period of zero when the contract is initialized', async function () {
        expect(await Staking.warmupPeriod()).to.equal(0);
      });

      it('setWarmup, should allow the manager to set a warmup period for new stakers', async function () {
        expect(await Staking.warmupPeriod()).to.equal(0);
        await Staking.setWarmup(5);
        expect(await Staking.warmupPeriod()).to.equal(5);
      });

      it('setWarmup, should revert if called by an address other than the manager', async function () {
        const [, alice] = users;
        await expect(alice.Staking.setWarmup(1)).to.be.revertedWith('UNAUTHORIZED');
      });
    });

    describe('stake', async function () {
      it('adds a Claim for the staked `_amount` to the staked collection when `_claim` is false and `warmupPeriod` is zero', async function () {
        const [, bob] = users;
        const claim = false;
        const expectedGonsInWarmup = await sTheo.gonsForBalance(amountToStake);
        await bob.Staking.stake(bob.address, amountToStake, claim);

        const stakingInfo = await Staking.stakingInfo(bob.address, 0);

        expect(stakingInfo.deposit.toNumber()).to.equal(amountToStake);
        expect(stakingInfo.gonsInWarmup.toString()).to.equal(expectedGonsInWarmup.toString());

        const latestBlock = await ethers.provider.getBlock('latest');
        expect(stakingInfo.warmupExpiry.toNumber()).to.equal(latestBlock.timestamp); // zero warmup period
        const upperBound = (latestBlock.timestamp + 31536000) * 1.0033; // Using seconds in a year, as currently used in deploy script
        const lowerBound = (latestBlock.timestamp + 31536000) * 0.9967; // Using seconds in a year, as currently used in deploy script
        expect(stakingInfo.stakingExpiry.toNumber()).to.be.lessThan(upperBound);
        expect(stakingInfo.stakingExpiry.toNumber()).to.be.greaterThan(lowerBound);
      });

      it('adds to the `total supply in warmup`, which represents the total amount of sTHEO currently in warmup', async function () {
        const [, bob] = users;
        const claim = false;

        expect(await Staking.supplyInWarmup()).to.equal(0);

        await bob.Staking.stake(bob.address, amountToStake, claim);
        expect(await Staking.supplyInWarmup()).to.equal(amountToStake); // sTheo.gonsForBalance(amount) returns amount
      });

      it('allows the staker to claim pTHEO immediately if `_claim` is true and warmup is zero', async function () {
        const [, bob] = users;
        const claim = true;

        expect(await sTheo.balanceOf(bob.address)).to.equal(0);

        await bob.Staking.stake(bob.address, amountToStake, claim);

        expect(await sTheo.balanceOf(bob.address)).to.equal(amountToStake);
        expect(await Staking.supplyInWarmup()).to.equal(0);
      });

      it('adds a claim with the correct information if `_claim` is true and warmup is zero', async function () {
        const [, bob] = users;
        const claim = true;

        await bob.Staking.stake(bob.address, amountToStake, claim);
        const stakingInfo = await Staking.stakingInfo(bob.address, 0);

        expect(stakingInfo.deposit.toNumber()).to.equal(amountToStake);
        expect(stakingInfo.gonsInWarmup.toNumber()).to.equal(0);
        expect(stakingInfo.warmupExpiry.toNumber()).to.equal(0);

        const latestBlock = await ethers.provider.getBlock('latest');
        const upperBound = (latestBlock.timestamp + 31536000) * 1.0033; // Using seconds in a year, as currently used in deploy script
        const lowerBound = (latestBlock.timestamp + 31536000) * 0.9967; // Using seconds in a year, as currently used in deploy script
        expect(stakingInfo.stakingExpiry.toNumber()).to.be.lessThan(upperBound);
        expect(stakingInfo.stakingExpiry.toNumber()).to.be.greaterThan(lowerBound);
      });

      it('can add multiple claims (where `_claim` is true and warmup is zero)', async function () {
        const [, bob] = users;
        const claim = true;

        expect(await sTheo.balanceOf(bob.address)).to.equal(0);

        await bob.Staking.stake(bob.address, amountToStake, claim);
        const stakingInfo = await Staking.stakingInfo(bob.address, 0);
        expect(stakingInfo.deposit.toNumber()).to.equal(amountToStake);

        const secondAmountToStake = 4000;
        await bob.Staking.stake(bob.address, secondAmountToStake, claim);
        const secondStakingInfo = await Staking.stakingInfo(bob.address, 1);
        expect(secondStakingInfo.deposit.toNumber()).to.equal(secondAmountToStake);

        expect(await sTheo.balanceOf(bob.address)).to.equal(amountToStake + secondAmountToStake);
        expect(await Staking.supplyInWarmup()).to.equal(0);
      });

      it('adds a Claim in warmup, with the correct deposit and expiry, when `_claim` is true and the warmup period is greater than 0', async function () {
        const [, bob] = users;
        const claim = true;
        const warmupPeriod = 60 * 60 * 24 * 5; // 5-day warmup

        await Staking.setWarmup(warmupPeriod);
        expect(await Staking.warmupPeriod()).to.equal(warmupPeriod);

        await bob.Staking.stake(bob.address, amountToStake, claim);

        expect(await Staking.supplyInWarmup()).to.equal(amountToStake);

        const stakingInfo = await Staking.stakingInfo(bob.address, 0);
        const latestBlock = await ethers.provider.getBlock('latest');
        expect(stakingInfo.deposit).to.equal(amountToStake);
        expect(stakingInfo.warmupExpiry).to.equal(latestBlock.timestamp + warmupPeriod);
      });
    });

    describe('Unstake', function () {
      it('will revert if the lengths of amounts and indexes do not match', async function () {
        const [, bob] = users;

        // Immediately claim sTheo (claim == true)
        await createClaim(amountToStake, true);
        await createClaim(amountToStake, true);
        await expect(bob.Staking.unstake(bob.address, [amountToStake], false, [0, 1])).to.be.revertedWith(
          'Amounts and indexes lengths do not match'
        );
      });

      it('allows a staker to unstake before the staking expiry time, providing that the amount to unstake matches the remaining amount available to redeem', async function () {
        const [, bob] = users;
        const claim = true;

        const bobStartingTheoBalance = await TheopetraERC20Token.balanceOf(bob.address);

        await bob.Staking.stake(bob.address, amountToStake, claim);

        expect((await TheopetraERC20Token.balanceOf(bob.address)).toString()).to.equal(
          bobStartingTheoBalance.sub(amountToStake).toString()
        );
        expect((await sTheo.balanceOf(bob.address)).toNumber()).to.equal(amountToStake);
        const stakingInfo = await Staking.stakingInfo(bob.address, 0);
        const latestBlock = await ethers.provider.getBlock('latest');

        expect(stakingInfo.stakingExpiry.toNumber()).to.be.greaterThan(latestBlock.timestamp);
        await bob.sTheo.approve(Staking.address, amountToStake);

        // Unstake the same amount that was originally staked
        await expect(bob.Staking.unstake(bob.address, [amountToStake], false, [0])).to.not.be.reverted;

        expect((await sTheo.balanceOf(bob.address)).toNumber()).to.equal(0);
      });

      it('will revert if a staker requests to unstake less than the remaining amount to redeem before 100% of the staking term', async function () {
        const [, bob] = users;

        const bobStartingTheoBalance = await TheopetraERC20Token.balanceOf(bob.address);

        await createClaim(amountToStake, true);

        expect((await TheopetraERC20Token.balanceOf(bob.address)).toString()).to.equal(
          bobStartingTheoBalance.sub(amountToStake).toString()
        );
        expect((await sTheo.balanceOf(bob.address)).toNumber()).to.equal(amountToStake);
        const stakingInfo = await Staking.stakingInfo(bob.address, 0);
        const latestBlock = await ethers.provider.getBlock('latest');

        expect(stakingInfo.stakingExpiry.toNumber()).to.be.greaterThan(latestBlock.timestamp);
        await bob.sTheo.approve(Staking.address, amountToStake);

        await expect(bob.Staking.unstake(bob.address, [amountToStake - 10_000_000_000], false, [0])).to.be.revertedWith(
          'Amount does not match available remaining to redeem'
        );
      });

      it('reverts if a staker attempts to unstake more than the remaining amount available to redeem (using sTheo immediately claimed, with no warmup)', async function () {
        const [, bob] = users;

        // Immediately claim sTheo (claim == true)
        await createClaim(amountToStake, true);
        await createClaim(amountToStake, true); // create second claim, to give bob sufficient sTHEO to attempt to unstake more than their claim limit

        expect((await sTheo.balanceOf(bob.address)).toNumber()).to.equal(amountToStake * 2);

        const additionalAmountToAttempt = 10_000_000_000;
        await bob.sTheo.approve(Staking.address, amountToStake + additionalAmountToAttempt);

        await expect(
          bob.Staking.unstake(bob.address, [amountToStake + additionalAmountToAttempt], false, [0])
        ).to.be.revertedWith('SafeMath: subtraction overflow');

        expect((await sTheo.balanceOf(bob.address)).toNumber()).to.equal(amountToStake * 2);
      });

      it('reverts if a staker attempts to unstake more than the remaining amount available to redeem (using sTheo claimed via warmup)', async function () {
        const [, bob] = users;

        await createClaim(amountToStake, false);
        await createClaim(amountToStake, false); // create second claim, to give bob sufficient sTHEO to attempt to unstake more than their claim limit

        await bob.Staking.claimAll(bob.address); // Can claim straight away (no movement forward in time needed)

        expect((await sTheo.balanceOf(bob.address)).toNumber()).to.equal(amountToStake * 2);

        const additionalAmountToAttempt = 10_000_000_000;
        await bob.sTheo.approve(Staking.address, amountToStake + additionalAmountToAttempt);

        await expect(
          bob.Staking.unstake(bob.address, [amountToStake + additionalAmountToAttempt], false, [0])
        ).to.be.revertedWith('SafeMath: subtraction overflow');

        expect((await sTheo.balanceOf(bob.address)).toNumber()).to.equal(amountToStake * 2);
      });

      it('correctly reduces -- to zero -- the amount of gons remaining to be redeemed on a Claim when redeeming before 100% of staking term', async function () {
        const [, bob] = users;

        await createClaim(amountToStake, false);
        await bob.Staking.claimAll(bob.address); // Can claim straight away (no movement forward in time needed)

        await bob.sTheo.approve(Staking.address, LARGE_APPROVAL);
        await bob.Staking.unstake(bob.address, [amountToStake], false, [0]);

        const firstClaimUpdatedInfo = await Staking.stakingInfo(bob.address, 0);

        expect(firstClaimUpdatedInfo.gonsRemaining).to.equal(0);
      });

      it('correctly reduces the amount of gons remaining to be redeemed on a Claim, when redeeming a partial amount of the total available, after 100% of staking term has passed', async function () {
        const [, bob] = users;

        await createClaim(amountToStake, false);
        await bob.Staking.claimAll(bob.address); // Can claim straight away (no movement forward in time needed)

        await bob.sTheo.approve(Staking.address, LARGE_APPROVAL);

        const amountToUnStake = amountToStake - 2_000_000_000;

        // Move time forward past 100% of staking term to allow partial redeem
        await moveTimeForward(lockedStakingTerm * 1.05);

        await bob.Staking.unstake(bob.address, [amountToUnStake], false, [0]);

        const firstClaimUpdatedInfo = await Staking.stakingInfo(bob.address, 0);
        const expectedGonsRemaining = (await sTheo.gonsForBalance(amountToStake)).sub(
          await sTheo.gonsForBalance(amountToUnStake)
        );

        expect(firstClaimUpdatedInfo.gonsRemaining).to.equal(expectedGonsRemaining);
      });

      it('correctly reduces the amount of gons remaining to be redeemed on multiple Claims, when unstaking after 100% of staking term has passed', async function () {
        const [, bob] = users;

        await createClaim(amountToStake, false);
        const secondAmountToStake = 6_000_000_000;
        await createClaim(secondAmountToStake, false);
        await bob.Staking.claimAll(bob.address); // Can claim straight away (no movement forward in time needed)

        await bob.sTheo.approve(Staking.address, LARGE_APPROVAL);
        const firstAmountToUnstake = amountToStake - 2_000_000_000;
        const secondAmountToUnstake = secondAmountToStake - 1_000_000_000;

        // Move time forward past 100% of staking term to allow partial redeem
        await moveTimeForward(lockedStakingTerm * 1.05);

        await bob.Staking.unstake(bob.address, [firstAmountToUnstake, secondAmountToUnstake], false, [0, 1]);

        const firstClaimUpdatedInfo = await Staking.stakingInfo(bob.address, 0);
        const secondClaimUpdatedInfo = await Staking.stakingInfo(bob.address, 1);
        const firstExpectedGonsRemaining = (await sTheo.gonsForBalance(amountToStake)).sub(
          await sTheo.gonsForBalance(firstAmountToUnstake)
        );
        const secondExpectedGonsRemaining = (await sTheo.gonsForBalance(secondAmountToStake)).sub(
          await sTheo.gonsForBalance(secondAmountToUnstake)
        );

        expect(firstClaimUpdatedInfo.gonsRemaining).to.equal(firstExpectedGonsRemaining);
        expect(secondClaimUpdatedInfo.gonsRemaining).to.equal(secondExpectedGonsRemaining);
      });

      it('allows a staker to redeem their pTHEO for the correct amount of THEO -- that is, their principal deposit minus penalty -- when 25% of their total staking expiry time has passed (75% remaining)', async function () {
        const [, bob, carol] = users;
        const claim = true;

        const bobStartingTheoBalance = await TheopetraERC20Token.balanceOf(bob.address);

        await bob.Staking.stake(bob.address, amountToStake, claim);

        const stakingInfo = await Staking.stakingInfo(bob.address, 0);
        const latestBlock = await ethers.provider.getBlock('latest');
        expect(stakingInfo.stakingExpiry.toNumber()).to.be.greaterThan(latestBlock.timestamp);
        await bob.sTheo.approve(Staking.address, amountToStake);

        await moveTimeForward(lockedStakingTerm / 4); // 25% of total staking expiry time passed
        await bob.Staking.unstake(bob.address, [amountToStake], false, [0]);

        expect(Number(await sTheo.balanceOf(bob.address))).to.equal(0);

        const expectedPenalty = amountToStake * 0.16;
        expect(Number(await TheopetraERC20Token.balanceOf(bob.address))).to.equal(
          bobStartingTheoBalance - expectedPenalty
        );
      });

      it('allows a staker to redeem their pTHEO for the correct amount of THEO -- deposit minus penalty -- at any time before the staking expiry', async function () {
        const [, bob] = users;
        const claim = true;

        const bobStartingTheoBalance = await TheopetraERC20Token.balanceOf(bob.address);

        await bob.Staking.stake(bob.address, amountToStake, claim);

        const stakingInfo = await Staking.stakingInfo(bob.address, 0);
        const latestBlock = await ethers.provider.getBlock('latest');
        expect(stakingInfo.stakingExpiry.toNumber()).to.be.greaterThan(latestBlock.timestamp);
        await bob.sTheo.approve(Staking.address, amountToStake);

        // calculate random time to move forward, between 0 and 99% of lockedStakingTerm
        const percentageComplete = randomIntFromInterval(0, 99);
        let expectedPenaltyProportion: number;
        if (percentageComplete <= 5) {
          expectedPenaltyProportion = 0.2;
        } else {
          // Taking into account whether or not the percentage complete is exactly at the start of a new penalty time-bracket
          expectedPenaltyProportion =
            ((percentageComplete % 5 === 0 ? 21 : 20) - Math.floor(percentageComplete / 5)) / 100;
        }
        const expectedPenalty = amountToStake * expectedPenaltyProportion;

        if (percentageComplete > 0) await moveTimeForward(lockedStakingTerm * (percentageComplete / 100));
        await bob.Staking.unstake(bob.address, [amountToStake], false, [0]);

        expect(Number(await sTheo.balanceOf(bob.address))).to.equal(0);

        expect(Number(await TheopetraERC20Token.balanceOf(bob.address))).to.equal(
          bobStartingTheoBalance - expectedPenalty
        );
      });

      it('allows a staker to redeem their pTHEO for THEO with 1% penalty if greater than 99% but less than 100% of the staking term has passed', async function () {
        const [, bob] = users;
        const claim = true;

        const bobStartingTheoBalance = await TheopetraERC20Token.balanceOf(bob.address);

        await bob.Staking.stake(bob.address, amountToStake, claim);

        const stakingInfo = await Staking.stakingInfo(bob.address, 0);
        const latestBlock = await ethers.provider.getBlock('latest');
        expect(stakingInfo.stakingExpiry.toNumber()).to.be.greaterThan(latestBlock.timestamp);
        await bob.sTheo.approve(Staking.address, amountToStake);

        const proportionOfStakingTermPassed = randomIntFromInterval(9900, 9999) / 10000;

        await moveTimeForward(lockedStakingTerm * proportionOfStakingTermPassed);
        await bob.Staking.unstake(bob.address, [amountToStake], false, [0]);

        expect(Number(await sTheo.balanceOf(bob.address))).to.equal(0);

        const expectedPenalty = amountToStake * 0.01;
        expect(Number(await TheopetraERC20Token.balanceOf(bob.address))).to.equal(
          bobStartingTheoBalance - expectedPenalty
        );
      });

      it('allows a staker to redeem their pTHEO for THEO with zero penalty if exactly 100% of the staking term has passed', async function () {
        const [, bob] = users;
        const claim = true;

        const bobStartingTheoBalance = await TheopetraERC20Token.balanceOf(bob.address);

        await bob.Staking.stake(bob.address, amountToStake, claim);

        const stakingInfo = await Staking.stakingInfo(bob.address, 0);
        const latestBlock = await ethers.provider.getBlock('latest');
        expect(stakingInfo.stakingExpiry.toNumber()).to.be.greaterThan(latestBlock.timestamp);
        await bob.sTheo.approve(Staking.address, amountToStake);

        const proportionOfStakingTermPassed = 1;

        await moveTimeForward(lockedStakingTerm * proportionOfStakingTermPassed);

        const newLatestBlock = await ethers.provider.getBlock('latest');
        const upperBound = newLatestBlock.timestamp * 1.0001;
        const lowerBound = newLatestBlock.timestamp * 0.9999;
        expect(stakingInfo.stakingExpiry.toNumber()).to.be.greaterThan(lowerBound);
        expect(stakingInfo.stakingExpiry.toNumber()).to.be.lessThan(upperBound);

        await bob.Staking.unstake(bob.address, [amountToStake], false, [0]);

        expect(Number(await sTheo.balanceOf(bob.address))).to.equal(0);

        const expectedPenalty = 0;
        expect(Number(await TheopetraERC20Token.balanceOf(bob.address))).to.equal(
          bobStartingTheoBalance - expectedPenalty
        );
      });

      it('allows a staker to redeem their pTHEO for THEO with zero penalty if greater than 100% of the staking term has passed', async function () {
        const [, bob] = users;
        const claim = true;

        const bobStartingTheoBalance = await TheopetraERC20Token.balanceOf(bob.address);

        await bob.Staking.stake(bob.address, amountToStake, claim);

        const stakingInfo = await Staking.stakingInfo(bob.address, 0);
        const latestBlock = await ethers.provider.getBlock('latest');
        expect(stakingInfo.stakingExpiry.toNumber()).to.be.greaterThan(latestBlock.timestamp);
        await bob.sTheo.approve(Staking.address, amountToStake);

        const proportionOfStakingTermPassed = randomIntFromInterval(10001, 99999) / 10000;

        await moveTimeForward(lockedStakingTerm * proportionOfStakingTermPassed);
        const newLatestBlock = await ethers.provider.getBlock('latest');
        expect(stakingInfo.stakingExpiry.toNumber()).to.be.lessThanOrEqual(newLatestBlock.timestamp);

        await bob.Staking.unstake(bob.address, [amountToStake], false, [0]);

        expect(Number(await sTheo.balanceOf(bob.address))).to.equal(0);

        const expectedPenalty = 0;
        expect(Number(await TheopetraERC20Token.balanceOf(bob.address))).to.equal(
          bobStartingTheoBalance - expectedPenalty
        );
      });

      it('adds slashed rewards to the redeemed amount, for a user unstaking against a claim after 100% of its staking term', async function () {
        const [, bob] = users;
        const claim = true;
        const amountToStakeAsBigNumber = ethers.BigNumber.from(amountToStake);

        await bob.Staking.stake(bob.address, amountToStake, claim);

        const secondAmountToStake = 2_000_000_000_000;
        await bob.Staking.stake(bob.address, secondAmountToStake, claim);

        // Add a third stake to ensure that there is non-zero circulating supply while unstaking the first two claims
        const thirdAmountToStake = 5_000_000_000_000;
        await bob.Staking.stake(bob.address, thirdAmountToStake, claim);
        await bob.sTheo.approve(Staking.address, amountToStake + secondAmountToStake);

        // Bob unstakes against second claim, before staking expiry time, and is slashed (adding to slashed gons)
        await bob.Staking.unstake(bob.address, [secondAmountToStake], false, [1]);

        // Move time beyond staking expiry, then unstake against first claim
        await moveTimeForward(lockedStakingTerm * 1.5);

        const bobTheoBalance = await TheopetraERC20Token.balanceOf(bob.address);
        await bob.Staking.unstake(bob.address, [amountToStake], false, [0]);

        // Calculate expected slashed rewards that will be added to the claimed amount
        const expectedTotalSlashedTokens = secondAmountToStake * 0.2; // Bob will unstake the second stake immediately (20% penalty on principal)
        const currentSTHEOCirculatingSupply = await sTheo.circulatingSupply();
        const expectedSlashedRewards = amountToStakeAsBigNumber
          .div(currentSTHEOCirculatingSupply)
          .mul(expectedTotalSlashedTokens);

        const bobNewTheoBalance = await TheopetraERC20Token.balanceOf(bob.address);

        expect(bobNewTheoBalance.sub(bobTheoBalance).eq(amountToStakeAsBigNumber.add(expectedSlashedRewards)));
      });

      it('allows a user to unstake for the correct amount after a rebase during unstaking', async function () {
        const [, bob] = users;
        await setupForRebase();

        // STAKE
        // Already in next epoch so rebase will occur when staking, but Profit will be zero at this point
        await createClaim(amountToStake, true);
        await createClaim(amountToStake * 1000, true);
        await moveTimeForward(lockedStakingTerm * 1.1); // Move past staking expiry to avoid penalty when unstaking

        const [, , , , gonsRemaining] = await Staking.stakingInfo(bob.address, 0);
        const balanceFromGons = await sTheo.balanceForGons(gonsRemaining);
        const bobTheoBalance = await TheopetraERC20Token.balanceOf(bob.address);

        // UNSTAKE
        await bob.sTheo.approve(Staking.address, LARGE_APPROVAL);
        await bob.Staking.unstake(bob.address, [balanceFromGons.toNumber()], true, [0]); // Set _trigger for rebase to be true, to cause rebase (with non-zero profit)
        const bobFinalTheoBalance = await TheopetraERC20Token.balanceOf(bob.address);
        const rewards = bobFinalTheoBalance.sub(balanceFromGons.add(bobTheoBalance));

        expect(rewards.toNumber()).to.greaterThan(0);
        // Rewards should be the difference between pTheo balance before and after rebase
        const newPTheoValueFromBalance = await sTheo.balanceForGons(gonsRemaining);
        expect(rewards).to.equal(newPTheoValueFromBalance.sub(balanceFromGons));
      });

      it('allows a user to unstake with rebasing during unstaking -- variation 2', async function () {
        const [, bob] = users;
        await setupForRebase();

        // STAKE
        // Already in next epoch so rebase will occur
        await createClaim(amountToStake, true);
        await moveTimeForward(9 * 60 * 60); // move into next epoch to ensure a rebase
        await createClaim(amountToStake * 1000, true);
        await moveTimeForward(9 * 60 * 60); // move into next epoch to ensure a rebase
        await createClaim(amountToStake * 2, false);

        const [deposit, , , , gonsRemaining] = await Staking.stakingInfo(bob.address, 0);
        const balanceFromGons = await sTheo.balanceForGons(gonsRemaining);

        // Unstake without further rebasing (trigger is false)
        // Bob incurs slashing penalty as unstaking before staking expiry time
        await bob.sTheo.approve(Staking.address, LARGE_APPROVAL);
        await bob.Staking.unstake(bob.address, [balanceFromGons.toNumber()], true, [0]);
      });

      it('allows a user to unstake with or without rebasing during unstaking', async function () {
        const [, bob] = users;
        await setupForRebase();
        const rnd = randomIntFromInterval(0, 1);
        const isRebaseTriggered = [true, false][rnd];
        console.log('Is Rebase Triggered on Unstaking?', isRebaseTriggered);

        // STAKE
        // Already in next epoch so rebase will occur
        await createClaim(amountToStake * 1000, true);
        await moveTimeForward(9 * 60 * 60); // move into next epoch to ensure a rebase
        await createClaim(amountToStake * 1000, true);

        const [deposit, , , , gonsRemaining] = await Staking.stakingInfo(bob.address, 0);
        const balanceFromGons = await sTheo.balanceForGons(gonsRemaining);

        // Unstake without further rebasing (trigger is false)
        // Bob incurs slashing penalty as unstaking before staking expiry time
        await bob.sTheo.approve(Staking.address, LARGE_APPROVAL);
        await bob.Staking.unstake(bob.address, [balanceFromGons.toNumber()], isRebaseTriggered, [0]);
      });

      it('allows a variety of staking and unstaking (with or without rebasing during unstakes), with movements in time', async function () {
        const [, bob] = users;
        await setupForRebase();
        const rnd = randomIntFromInterval(0, 1);
        const isRebaseTriggered = [true, false][rnd];
        console.log('Is Rebase Triggered on Unstaking?', isRebaseTriggered);

        await createClaim(amountToStake, true);
        await createClaim(amountToStake * 1000, true);
        await moveTimeForward(9 * 60 * 60); // move into next epoch to ensure a rebase
        await createClaim(amountToStake * 2, false);
        const [, , , , gonsRemainingOne] = await Staking.stakingInfo(bob.address, 0);
        const balanceFromGonsOne = await sTheo.balanceForGons(gonsRemainingOne);
        const [, , , , gonsRemainingTwo] = await Staking.stakingInfo(bob.address, 1);
        const balanceFromGonsTwo = await sTheo.balanceForGons(gonsRemainingTwo);
        await bob.sTheo.approve(Staking.address, LARGE_APPROVAL);
        await bob.Staking.unstake(bob.address, [balanceFromGonsOne.toNumber()], false, [0]);
        await bob.Staking.unstake(bob.address, [balanceFromGonsTwo.toNumber()], true, [1]);
        await createClaim(amountToStake * 3, true);
        const [, , , , gonsRemainingFour] = await Staking.stakingInfo(bob.address, 3);
        const balanceFromGonsFour = await sTheo.balanceForGons(gonsRemainingFour);
        await bob.Staking.unstake(bob.address, [balanceFromGonsFour.toNumber()], isRebaseTriggered, [3]);
      });
    });

    describe('claim', function () {
      it('allows a recipient to claim sTHEO from warmup when warmup period is zero', async function () {
        const [, bob] = users;
        await createClaim();
        expect(await sTheo.balanceOf(bob.address)).to.equal(0);

        await bob.Staking.claim(bob.address, [0]); // Can claim straight away (no movement forward in time needed)
        expect(await sTheo.balanceOf(bob.address)).to.equal(amountToStake);
      });

      it('allows a recipient to claims all of their claims from warmup (with warmup period zero)', async function () {
        const [, bob] = users;
        await createClaim();
        const secondStakeAmount = 10_000_000_000_000;
        await createClaim(secondStakeAmount);
        const thirdStakeAmount = 7_000_000_000_000;
        await createClaim(thirdStakeAmount);

        expect(await sTheo.balanceOf(bob.address)).to.equal(0);

        await bob.Staking.claim(bob.address, [0, 1, 2]); // Can claim straight away (no movement forward in time needed)

        expect(await sTheo.balanceOf(bob.address)).to.equal(amountToStake + secondStakeAmount + thirdStakeAmount);
      });

      it('allows a recipient to claim multiple of their claims from warmup (with warmup period zero)', async function () {
        const [, bob] = users;
        await createClaim();
        const secondStakeAmount = 10_000_000_000_000;
        await createClaim(secondStakeAmount);
        const thirdStakeAmount = 7_000_000_000_000;
        await createClaim(thirdStakeAmount);

        expect(await sTheo.balanceOf(bob.address)).to.equal(0);

        await bob.Staking.claim(bob.address, [0, 2]); // Can claim straight away (no movement forward in time needed)

        expect(await sTheo.balanceOf(bob.address)).to.equal(amountToStake + thirdStakeAmount);
      });

      it('allows a recipient to claim only claims that are out of warmup when making multiple claims', async function () {
        const [, bob] = users;
        await Staking.setWarmup(60 * 60 * 24 * 7); // Set warmup to be 7 days

        await createClaim();
        const secondStakeAmount = 10_000_000_000_000;
        await createClaim(secondStakeAmount);
        await moveTimeForward(60 * 60 * 24 * 7 + 60); // Move time past warmup period

        const thirdStakeAmount = 7_000_000_000_000;
        await createClaim(thirdStakeAmount);
        // Third stake is still in warmup; Only first and second stakes can be claimed

        expect(await sTheo.balanceOf(bob.address)).to.equal(0);

        await bob.Staking.claim(bob.address, [0, 1, 2]);

        expect(await sTheo.balanceOf(bob.address)).to.equal(amountToStake + secondStakeAmount);
      });

      it('allows a recipient to claim sTHEO from warmup, when warmup period is non-zero, after the warmup period has passed', async function () {
        const [, bob] = users;
        await Staking.setWarmup(60 * 60 * 24 * 7); // Set warmup to be 7 days

        await createClaim();
        expect(await sTheo.balanceOf(bob.address)).to.equal(0);

        await moveTimeForward(60 * 60 * 24 * 7 + 60); // Move time past warmup period
        await bob.Staking.claim(bob.address, [0]);
        expect(await sTheo.balanceOf(bob.address)).to.equal(amountToStake);
      });

      it('updates the claim information with gonsInWarmup set to zero and gonsRemaining set to the the original value for gonsInWarmup', async function () {
        const [, bob] = users;
        await createClaim();
        const bobInitialStakingInfo = await Staking.stakingInfo(bob.address, 0);

        const amountInGons = await sTheo.gonsForBalance(amountToStake);
        expect(bobInitialStakingInfo.gonsInWarmup.toString()).to.equal(amountInGons.toString());

        await bob.Staking.claim(bob.address, [0]); // Can claim straight away (no movement forward in time needed)
        const bobNewStakingInfo = await Staking.stakingInfo(bob.address, 0);
        expect(bobNewStakingInfo.gonsInWarmup.toNumber()).to.equal(0);
        expect(bobNewStakingInfo.gonsRemaining.toString()).to.equal(bobInitialStakingInfo.gonsInWarmup.toString());
      });

      it('only sets gonsRemaining once per Claim: it prevents re-retrieval of already retrieved claims', async function () {
        const [, bob] = users;
        await createClaim();
        const bobInitialStakingInfo = await Staking.stakingInfo(bob.address, 0);

        // First claim
        await bob.Staking.claim(bob.address, [0]); // Can claim straight away (no movement forward in time needed)

        const bobSecondStakingInfo = await Staking.stakingInfo(bob.address, 0);
        expect(bobSecondStakingInfo.gonsRemaining.toString()).to.equal(bobInitialStakingInfo.gonsInWarmup.toString());

        // Second claim on the same index as the first
        await bob.Staking.claim(bob.address, [0]);
        const bobFinalStakingInfo = await Staking.stakingInfo(bob.address, 0);
        expect(bobFinalStakingInfo.gonsRemaining.toString()).to.equal(bobSecondStakingInfo.gonsRemaining.toString());
      });

      it('errors and does not transfer any sTHEO when there is no claim', async function () {
        const [, bob] = users;
        await createClaim();
        const bobInitialStakingInfo = await Staking.stakingInfo(bob.address, 0);

        const amountInGons = await sTheo.gonsForBalance(amountToStake);
        expect(bobInitialStakingInfo.gonsInWarmup.toString()).to.equal(amountInGons.toString());

        await bob.Staking.claim(bob.address, [0]); // Can claim straight away (no movement forward in time needed)
        const bobNewStakingInfo = await Staking.stakingInfo(bob.address, 0);
        expect(bobNewStakingInfo.gonsInWarmup.toNumber()).to.equal(0);
        expect(bobNewStakingInfo.gonsRemaining.toString()).to.equal(bobInitialStakingInfo.gonsInWarmup.toString());
      });

      it('only sets gonsRemaining once per Claim: it prevents re-retrieval of already retrieved claims', async function () {
        const [, bob] = users;
        await createClaim();
        const bobInitialStakingInfo = await Staking.stakingInfo(bob.address, 0);

        // First claim
        await bob.Staking.claim(bob.address, [0]); // Can claim straight away (no movement forward in time needed)

        const bobSecondStakingInfo = await Staking.stakingInfo(bob.address, 0);
        expect(bobSecondStakingInfo.gonsRemaining.toString()).to.equal(bobInitialStakingInfo.gonsInWarmup.toString());

        // Second claim on the same index as the first
        await bob.Staking.claim(bob.address, [0]);
        const bobFinalStakingInfo = await Staking.stakingInfo(bob.address, 0);
        expect(bobFinalStakingInfo.gonsRemaining.toString()).to.equal(bobSecondStakingInfo.gonsRemaining.toString());
      });

      it('errors and does not transfer any sTHEO when there is no claim', async function () {
        const [, bob] = users;

        expect(await sTheo.balanceOf(bob.address)).to.equal(0);

        try {
          await bob.Staking.claim(bob.address, [0]);
        } catch (error: any) {
          expect(error.message).to.include('VM Exception while processing transaction: invalid opcode');
        }

        expect(await sTheo.balanceOf(bob.address)).to.equal(0);

        try {
          await bob.Staking.claim(bob.address, [0]);
        } catch (error: any) {
          expect(error.message).to.include('VM Exception while processing transaction: invalid opcode');
        }

        expect(await sTheo.balanceOf(bob.address)).to.equal(0);
      });

      it('does not transfer any sTHEO if an attempt is made to immediately claim a Claim that is still in warmup', async function () {
        const [, bob] = users;
        await Staking.setWarmup(60 * 60 * 24 * 5); // Set warmup to be 5 days
        await createClaim();
        // No movement forward in time: claim still in warmup

        await bob.Staking.claim(bob.address, [0]);
        expect(await Staking.supplyInWarmup()).to.equal(amountToStake);
        expect(await sTheo.balanceOf(bob.address)).to.equal(0);
      });

      it('does not transfer any sTHEO if an attempt is made to claim a Claim in warmup before the warmup period is over', async function () {
        const [, bob] = users;
        await Staking.setWarmup(60 * 60 * 24 * 5); // Set warmup to be 5 days
        await createClaim();

        await moveTimeForward(60 * 60 * 9); // Move time forward by less than warmup period
        // Claim still in warmup
        await bob.Staking.claim(bob.address, [0]);
        expect(await Staking.supplyInWarmup()).to.equal(amountToStake);
        expect(await sTheo.balanceOf(bob.address)).to.equal(0);
      });
    });

    describe('claimAll', function () {
      it('allows a recipient to claim all of their claims that are out of warmup', async function () {
        const [, bob] = users;
        await Staking.setWarmup(60 * 60 * 24 * 7); // Set warmup to be 7 days

        await createClaim();
        const secondStakeAmount = 10_000_000_000_000;
        await createClaim(secondStakeAmount);
        await moveTimeForward(60 * 60 * 24 * 7 + 60); // Move time past warmup period

        const thirdStakeAmount = 7_000_000_000_000;
        await createClaim(thirdStakeAmount);
        // Third stake is still in warmup; Only first and second stakes can be claimed

        await bob.Staking.claimAll(bob.address);
        expect(await sTheo.balanceOf(bob.address)).to.equal(amountToStake + secondStakeAmount);
      });
    });

    describe('isUnRetrieved', function () {
      it('will return true for a claim that is in warmup', async function () {
        const [, bob] = users;
        await Staking.setWarmup(60 * 60 * 24 * 5); // Set warmup to be 5 days
        await createClaim();

        expect(await Staking.isUnRetrieved(bob.address, 0)).to.equal(true);
      });

      it('will return true for a claim that is out of warmup but that has not yet been claimed', async function () {
        const [, bob] = users;
        await createClaim(); // zero warmup

        expect(await Staking.isUnRetrieved(bob.address, 0)).to.equal(true);
      });

      it('will return false for a claim that has been claimed', async function () {
        const [, bob] = users;
        await createClaim(); // zero warmup

        await bob.Staking.claim(bob.address, [0]);
        expect(await Staking.isUnRetrieved(bob.address, 0)).to.equal(false);
      });
    });

    describe('isUnRedeemed', function () {
      it('will return false for a claim that is in warmup', async function () {
        const [, bob] = users;
        await Staking.setWarmup(60 * 60 * 24 * 5); // Set warmup to be 5 days
        await createClaim();

        expect(await Staking.isUnRedeemed(bob.address, 0)).to.equal(false);
      });

      it('will return true for a claim that has sTHEO remaining to be redeemed (after being claimed from warmup)', async function () {
        const [, bob] = users;
        await createClaim(); // zero warmup period

        await bob.Staking.claim(bob.address, [0]);
        expect(await Staking.isUnRedeemed(bob.address, 0)).to.equal(true);
      });

      it('will return false for a claim has had all sTHEO redeemed (unstaked)', async function () {
        const [, bob] = users;
        await createClaim(); // zero warmup period

        await bob.Staking.claim(bob.address, [0]);

        await bob.sTheo.approve(Staking.address, amountToStake);
        await bob.Staking.unstake(bob.address, [amountToStake], false, [0]);
        expect(await Staking.isUnRedeemed(bob.address, 0)).to.equal(false);
      });

      it('will return true until all of the available sTHEO has been redeemed (unstaked)', async function () {
        const [, bob] = users;
        await createClaim(); // zero warmup period

        await bob.Staking.claim(bob.address, [0]);

        await moveTimeForward(lockedStakingTerm * 1.05); // move passed 100% of staking term to allow partial redeems

        await bob.sTheo.approve(Staking.address, amountToStake);
        await bob.Staking.unstake(bob.address, [amountToStake - amountToStake / 2], false, [0]);
        expect(await Staking.isUnRedeemed(bob.address, 0)).to.equal(true);
        await bob.Staking.unstake(bob.address, [amountToStake - amountToStake / 2], false, [0]);
        expect(await Staking.isUnRedeemed(bob.address, 0)).to.equal(false);
      });
    });

    describe('indexesFor', function () {
      it('returns the indexes of un-retrieved claims (that is, claims that have sTHEO that can be retrieved from warmup)', async function () {
        const [, bob] = users;
        await createClaim();
        await createClaim();
        await createClaim();

        await bob.Staking.claim(bob.address, [1]);
        const response = await Staking.indexesFor(bob.address, true); //
        const returnedIndexes = response.map((element: any) => element.toNumber());
        const expectedIndexes = [0, 2];
        expect(returnedIndexes).to.deep.equal(expectedIndexes);
      });
    });

    describe('isExternalLocked', function () {
      it('prevents staking from an external account by default', async function () {
        const [, bob, carol] = users;
        const claim = true;

        // Bob cannot, by default, stake for carol
        await expect(bob.Staking.stake(carol.address, amountToStake, claim)).to.be.revertedWith(
          'External deposits for account are locked'
        );
      });

      it('allows self-stakes (while preventing external stakes by default)', async function () {
        const [, bob, carol] = users;
        const claim = true;

        // Bob can self-stake
        await expect(bob.Staking.stake(bob.address, amountToStake, claim)).to.not.be.reverted;

        // Bob cannot, by default, stake for carol
        await expect(bob.Staking.stake(carol.address, amountToStake, claim)).to.be.revertedWith(
          'External deposits for account are locked'
        );
      });

      it('allows an external stake, with immediate claim, when recipient toggles their `isExternalLocked` lock', async function () {
        const [, bob, carol] = users;
        const claim = true;

        await carol.Staking.toggleLock();

        await expect(bob.Staking.stake(carol.address, amountToStake, claim)).to.not.be.reverted;
      });

      it('allows an external stake, with non-immediate claim, when recipient toggles their `isExternalLocked` lock', async function () {
        const [, bob, carol] = users;
        const claim = false;

        await carol.Staking.toggleLock();

        await expect(bob.Staking.stake(carol.address, amountToStake, claim)).to.not.be.reverted;

        expect(await Staking.supplyInWarmup()).to.equal(amountToStake);

        const stakingInfo = await Staking.stakingInfo(carol.address, 0);
        expect(stakingInfo.deposit).to.equal(amountToStake);
      });

      it('prevents an external claim by default', async function () {
        const [, bob, carol] = users;
        await createClaim(); // Create a claim for Bob

        await expect(carol.Staking.claim(bob.address, [0])).to.be.revertedWith(
          'External claims for account are locked'
        );
      });

      it('allows an external claim to be made for sTHEO, if the receipient has toggled their lock', async function () {
        const [, bob, carol] = users;
        await createClaim(); // Create a claim for Bob

        await bob.Staking.toggleLock();
        await moveTimeForward(60 * 60 * 9); // Move time forward into the next epoch to allow claim amount to be sent

        await expect(carol.Staking.claim(bob.address, [0])).to.not.be.reverted;
        expect(await sTheo.balanceOf(bob.address)).to.equal(amountToStake);
      });

      it('allows an internal claim after the recipient has toggled the lock', async function () {
        const [, bob] = users;
        await createClaim(); // Create a claim for Bob

        await bob.Staking.toggleLock();
        await moveTimeForward(60 * 60 * 9); // Move time forward into the next epoch to allow claim amount to be sent

        await bob.Staking.claim(bob.address, [0]);
        expect(await sTheo.balanceOf(bob.address)).to.equal(amountToStake);
      });

      it('prevents an external unstake by default', async function () {
        const [, bob, carol] = users;

        await createClaim();

        await expect(carol.Staking.unstake(bob.address, [amountToStake], false, [0])).to.be.revertedWith(
          'External unstaking for account is locked'
        );
      });

      it('allows an external unstake if the recipient has toggled the lock', async function () {
        const [, bob, carol] = users;

        await createClaim(amountToStake, true);
        await bob.Staking.toggleLock();
        await bob.sTheo.transfer(carol.address, amountToStake);

        await carol.sTheo.approve(Staking.address, amountToStake);

        await expect(carol.Staking.unstake(bob.address, [amountToStake], false, [0])).to.not.be.reverted;
      });
    });

    describe('getPenalty', function () {
      it('gets the right penalty', async () => {
        // 800 * .2 = 160
        expect(await Staking.getPenalty(800, 4)).to.equal(BigNumber.from(160));
        expect(await Staking.getPenalty(800, 5)).to.equal(BigNumber.from(160));

        // 800 * .19 = 152
        expect(await Staking.getPenalty(800, 8)).to.equal(BigNumber.from(152));
        expect(await Staking.getPenalty(800, 10)).to.equal(BigNumber.from(152));

        // 800 * .18 = 144
        expect(await Staking.getPenalty(800, 12)).to.equal(BigNumber.from(144));
        expect(await Staking.getPenalty(800, 15)).to.equal(BigNumber.from(144));

        // 800 * .17 = 136
        expect(await Staking.getPenalty(800, 16)).to.equal(BigNumber.from(136));
        expect(await Staking.getPenalty(800, 20)).to.equal(BigNumber.from(136));

        // 800 * .16 = 128
        expect(await Staking.getPenalty(800, 21)).to.equal(BigNumber.from(128));
        expect(await Staking.getPenalty(800, 25)).to.equal(BigNumber.from(128));

        // 800 * .15 = 120
        expect(await Staking.getPenalty(800, 26)).to.equal(BigNumber.from(120));
        expect(await Staking.getPenalty(800, 30)).to.equal(BigNumber.from(120));

        // 800 * .14 = 112
        expect(await Staking.getPenalty(800, 31)).to.equal(BigNumber.from(112));
        expect(await Staking.getPenalty(800, 35)).to.equal(BigNumber.from(112));

        // 800 * .13 = 104
        expect(await Staking.getPenalty(800, 36)).to.equal(BigNumber.from(104));
        expect(await Staking.getPenalty(800, 40)).to.equal(BigNumber.from(104));

        // 800 * .12 = 96
        expect(await Staking.getPenalty(800, 41)).to.equal(BigNumber.from(96));
        expect(await Staking.getPenalty(800, 45)).to.equal(BigNumber.from(96));
        // 800 * .11 = 88
        expect(await Staking.getPenalty(800, 49)).to.equal(BigNumber.from(88));
        expect(await Staking.getPenalty(800, 50)).to.equal(BigNumber.from(88));

        //800 * .10 = 80
        expect(await Staking.getPenalty(800, 52)).to.equal(BigNumber.from(80));
        expect(await Staking.getPenalty(800, 55)).to.equal(BigNumber.from(80));

        //800 * .9 = 72
        expect(await Staking.getPenalty(800, 56)).to.equal(BigNumber.from(72));
        expect(await Staking.getPenalty(800, 60)).to.equal(BigNumber.from(72));

        //800 * .8 = 64
        expect(await Staking.getPenalty(800, 61)).to.equal(BigNumber.from(64));
        expect(await Staking.getPenalty(800, 65)).to.equal(BigNumber.from(64));

        //800 * .7 = 56
        expect(await Staking.getPenalty(800, 69)).to.equal(BigNumber.from(56));
        expect(await Staking.getPenalty(800, 70)).to.equal(BigNumber.from(56));

        // Expect calculation for 800 * .6 = 48
        expect(await Staking.getPenalty(800, 71)).to.equal(BigNumber.from(48));
        expect(await Staking.getPenalty(800, 75)).to.equal(BigNumber.from(48));

        // Expect calculation for 800 * .5 = 40
        expect(await Staking.getPenalty(800, 76)).to.equal(BigNumber.from(40));
        expect(await Staking.getPenalty(800, 80)).to.equal(BigNumber.from(40));

        // Expect calculation for 800 * .4 = 32
        expect(await Staking.getPenalty(800, 81)).to.equal(BigNumber.from(32));
        expect(await Staking.getPenalty(800, 85)).to.equal(BigNumber.from(32));

        // Expect calculation for 800 * .3 = 24
        expect(await Staking.getPenalty(800, 86)).to.equal(BigNumber.from(24));
        expect(await Staking.getPenalty(800, 90)).to.equal(BigNumber.from(24));

        // Expect calculation for 800 * .2 = 16
        expect(await Staking.getPenalty(800, 91)).to.equal(BigNumber.from(16));
        expect(await Staking.getPenalty(800, 95)).to.equal(BigNumber.from(16));

        // Expect calculation for 800 * .1 = 8
        expect(await Staking.getPenalty(800, 96)).to.equal(BigNumber.from(8));
        expect(await Staking.getPenalty(800, 98)).to.equal(BigNumber.from(8));

        // It should never get here if it's 100% but we want to ensure its 0
        // expect(await Staking.getPenalty(800,)).to.equal(BigNumber.from(0));
      });
    });

    describe('definePenalties', function () {
      it('policy can redefine penalty bands', async function() {
        const bands = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
        const penalties = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
        await expect (Staking.definePenalties(bands, penalties)).to.not.be.reverted;
      });
      it('modifies the penalty bands', async function() {
        expect(await Staking.getPenalty(800, 4)).to.equal(BigNumber.from(160));
        expect(await Staking.getPenalty(800, 5)).to.equal(BigNumber.from(160));
        const bands = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
        const penalties = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        await expect (Staking.definePenalties(bands, penalties)).to.not.be.reverted;

        expect(await Staking.getPenalty(800, 4)).to.equal(BigNumber.from(0));
      });
      it('reverts when called by non-policy address', async function() {
        const bands = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
        const penalties = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
        const [, bob] = users;

        await expect (bob.Staking.definePenalties(bands, penalties)).to.be.reverted;
      });
    });

    describe('transfer claim', function () {
      it('allows a user to transfer a claim to a new user', async function () {
        const [, bob, carol] = users;
        await createClaim();
        await expect(Staking.stakingInfo(bob.address, 0)).to.not.be.reverted;
        await expect(Staking.stakingInfo(carol.address, 0)).to.be.reverted;

        await bob.Staking.pushClaim(carol.address, 0);
        await carol.Staking.pullClaim(bob.address, 0);

        const carolStakingInfo = await Staking.stakingInfo(carol.address, 0);
        const bobStakingInfo = await Staking.stakingInfo(bob.address, 0);

        expect(carolStakingInfo.deposit.toNumber()).to.equal(amountToStake);
        expect(bobStakingInfo.deposit.toNumber()).to.equal(0);
        expect(bobStakingInfo.stakingExpiry.toNumber()).to.equal(0);
      });

      it('allows a user to unstake against a claim after it has been transfered to them', async function () {
        const [, bob, carol] = users;
        await createClaim(amountToStake, true); // Immediate claim (no warmup)
        await bob.Staking.pushClaim(carol.address, 0);
        await carol.Staking.pullClaim(bob.address, 0);
        expect(Number(await TheopetraERC20Token.balanceOf(carol.address))).to.equal(0);

        // Transfer sTHEO from bob to carol
        expect(Number(await sTheo.balanceOf(bob.address))).to.be.greaterThan(0);
        const bobSTheoBalance = await sTheo.balanceOf(bob.address);
        await bob.sTheo.transfer(carol.address, bobSTheoBalance);
        expect(Number(await sTheo.balanceOf(carol.address))).to.equal(bobSTheoBalance);

        await moveTimeForward(lockedStakingTerm * 2); // Move past locked staking term to avoid penalty

        await carol.sTheo.approve(Staking.address, amountToStake);
        await carol.Staking.unstake(carol.address, [amountToStake], false, [0]);
        expect(Number(await sTheo.balanceOf(carol.address))).to.equal(0);
        expect(Number(await TheopetraERC20Token.balanceOf(carol.address))).to.be.greaterThan(0);
      });

      it('reverts if a user tries to pull a claim from the transfers mapping that was not previously pushed to them', async function () {
        const [, bob, carol, alice] = users;
        await createClaim(amountToStake, true); // Immediate claim (no warmup)
        await bob.Staking.pushClaim(carol.address, 0);
        await expect(alice.Staking.pullClaim(bob.address, 0)).to.be.revertedWith('Staking: claim not found');
      });

      it('reverts if a user tries to pull claim claim that has previously been redeemed', async function () {
        const [, bob, carol] = users;
        await createClaim(amountToStake, true); // Immediate claim (no warmup)
        await bob.Staking.pushClaim(carol.address, 0);

        // Before carol pulls claim, bob redeems
        await moveTimeForward(lockedStakingTerm * 2); // Move past locked staking term to avoid penalty
        await bob.sTheo.approve(Staking.address, amountToStake);
        await bob.Staking.unstake(bob.address, [amountToStake], false, [0]);

        await expect(carol.Staking.pullClaim(bob.address, 0)).to.be.revertedWith('Staking: claim redeemed');
      });
    });

    describe('forfeit', function () {
      it('allows a user to forfeit', async function () {
        const [, bob] = users;
        const claim = false;
        const secondAmountToStake = 300_000_000_000;
        const thirdAmountToStake = 500_000_000_000;
        const mistakeAmount = 700_000_000_000;
        await createClaim(amountToStake, claim);
        await createClaim(secondAmountToStake, claim);
        await createClaim(thirdAmountToStake, claim);
        await createClaim(mistakeAmount, false);

        const bobStartingTheoBalance = Number(await TheopetraERC20Token.balanceOf(bob.address));

        const mistakenClaimInfo = await Staking.stakingInfo(bob.address, 3);
        expect(Number(mistakenClaimInfo.gonsInWarmup)).to.be.greaterThan(0);

        await bob.Staking.forfeit(3);
        const mistakenClaimInfoUpdated = await Staking.stakingInfo(bob.address, 3);
        const firstClaimInfo = await Staking.stakingInfo(bob.address, 0);

        expect(Number(mistakenClaimInfoUpdated.gonsInWarmup)).to.equal(0);
        expect(Number(firstClaimInfo.gonsInWarmup)).to.be.greaterThan(0);

        const bobNewTheoBalance = Number(await TheopetraERC20Token.balanceOf(bob.address));
        expect(bobNewTheoBalance).to.be.greaterThan(bobStartingTheoBalance);
      });
    });

    describe('staking info', function () {
      it('can derive amount staked, staking date, expiry, current value', async function () {
        const [, bob] = users;
        const claim = true;

        expect(await sTheo.balanceOf(bob.address)).to.equal(0);

        const stakingTerm = 31536000; // Using seconds in a year, as currently used in deploy script
        const txn = await bob.Staking.stake(bob.address, amountToStake, claim);
        const blockTimestamp = (await ethers.provider.getBlock(txn.blockNumber)).timestamp;
        expect(await sTheo.balanceOf(bob.address)).to.equal(amountToStake);
        const stakingInfo = await bob.Staking.stakingInfo(bob.address, 0);
        const amountToStakeInGons = await sTheo.gonsForBalance(amountToStake);

        // returns correct expiry time
        expect(stakingInfo.stakingExpiry.toNumber()).to.equal(blockTimestamp + stakingTerm);
        // staking expiry minus staking term should return the time staking started, can be used to show on UI
        expect(stakingInfo.stakingExpiry.toNumber() - stakingTerm).to.equal(blockTimestamp);
        // returns correct amount staked, can also be converted to current sTHEO value using `balanceForGons`
        expect(stakingInfo.gonsRemaining).to.equal(amountToStakeInGons);
      });
    });

    describe('UI-related', function () {
      it('returns the number of staking claims for a user', async function () {
        const [, bob] = users;
        await createClaim();
        await createClaim();
        await createClaim();

        const claimCount = await Staking.getClaimsCount(bob.address);
        expect(claimCount.toNumber()).to.equal(3);
      });

      it('returns information for each claim of a user -- including THEO deposit amount, amount of locked staked THEO remaining or in warmup, and lock expiry time', async function () {
        const [, bob] = users;
        const latestBlock = await ethers.provider.getBlock('latest');
        const upperBound = latestBlock.timestamp * 1.0001;
        const lowerBound = latestBlock.timestamp * 0.9999;
        await createClaim(); //Claim goes into warmup with warmup expiry period of zero
        const additionalTime = 60 * 60 * 24 * 10;
        await moveTimeForward(additionalTime);
        const secondAmountToStake = amountToStake * 2;
        await createClaim(secondAmountToStake, true); // Immediate send of sTHEO to user (claim === true)

        const claimCount = (await Staking.getClaimsCount(bob.address)).toNumber();

        const claims: any = [];
        for (let i = 0; i < claimCount; i++) {
          const claim = await Staking.stakingInfo(bob.address, i);
          claims.push(claim);
        }

        const [depositOne, gonsInWarmupOne, warmupExpiryOne, stakingExpiryOne, gonsRemainingOne] = claims[0];
        const amountInWarmupOne = await sTheo.balanceForGons(gonsInWarmupOne);
        const amountRemainingOne = await sTheo.balanceForGons(gonsRemainingOne);

        expect(depositOne.toNumber()).to.equal(amountToStake);
        expect(amountInWarmupOne.toNumber()).to.equal(amountToStake);
        expect(warmupExpiryOne.toNumber()).to.be.greaterThan(lowerBound);
        expect(warmupExpiryOne.toNumber()).to.be.lessThan(upperBound);
        expect(stakingExpiryOne.toNumber()).to.be.greaterThan(lowerBound + lockedStakingTerm);
        expect(stakingExpiryOne.toNumber()).to.be.lessThan(upperBound + lockedStakingTerm);
        expect(amountRemainingOne.toNumber()).to.equal(0);

        const [depositTwo, gonsInWarmupTwo, warmupExpiryTwo, stakingExpiryTwo, gonsRemainingTwo] = claims[1];
        const amountInWarmupTwo = await sTheo.balanceForGons(gonsInWarmupTwo);
        const amountRemainingTwo = await sTheo.balanceForGons(gonsRemainingTwo);

        expect(depositTwo.toNumber()).to.equal(secondAmountToStake);
        expect(amountInWarmupTwo.toNumber()).to.equal(0);
        expect(warmupExpiryTwo.toNumber()).to.equal(0);
        expect(stakingExpiryTwo.toNumber()).to.be.greaterThan(lowerBound + additionalTime + lockedStakingTerm);
        expect(stakingExpiryTwo.toNumber()).to.be.lessThan(upperBound + additionalTime + lockedStakingTerm);
        expect(amountRemainingTwo.toNumber()).to.be.greaterThanOrEqual(secondAmountToStake);
      });

      it('emits an event containing how much THEO has been transfered to the user when they unstake', async function () {
        const [, bob] = users;
        const claim = true;

        await createClaim(amountToStake, claim);
        await moveTimeForward(lockedStakingTerm * 1.5); // Move time beyond staking expiry

        await bob.sTheo.approve(Staking.address, amountToStake);
        const { events } = await waitFor(bob.Staking.unstake(bob.address, [amountToStake], false, [0]));
        const decoded = decodeLogs(events, [TheopetraERC20Token]);

        const [from, to, amount] = decoded[0].args;
        expect(decoded[0].name).to.equal('Transfer');
        expect(from).to.equal(Staking.address);
        expect(to).to.equal(bob.address);
        expect(amount.toNumber()).to.equal(amountToStake);
      });

      it('gives the current expected rewards for a claim', async function () {
        const [, bob] = users;
        await createClaim(amountToStake, true);
        const currentRewards = await Staking.rewardsFor(bob.address, 0);

        // Expect zero difference between deposit and amount of sTHEO available for claim, as no rebase has occured.
        // And zero slashedRewards added
        expect(currentRewards.toNumber()).to.equal(0);
      });

      it('gives the correct expected rewards for claims', async function () {
        const [, bob] = users;
        await setupForRebase();

        // STAKE
        // Already in next epoch so rebase will occur
        await createClaim(amountToStake * 1000, true);
        await moveTimeForward(9 * 60 * 60); // move into next epoch to ensure a rebase
        const secondAmountToStake = amountToStake * 1000;
        await createClaim(secondAmountToStake, true);

        const rewardsForOne = await Staking.rewardsFor(bob.address, 0);
        const rewardsForTwo = await Staking.rewardsFor(bob.address, 1);

        const [deposit, , , , gonsRemaining] = await Staking.stakingInfo(bob.address, 0);
        const balanceFromGons = await sTheo.balanceForGons(gonsRemaining);

        expect(rewardsForOne).to.equal(balanceFromGons.sub(deposit)); // First claim gains rewards via sTHEO rebasing with profit
        expect(rewardsForTwo).to.equal(0); // Second claim has not yet benefitted from rebasing

        // Unstake without further rebasing (trigger is false)
        // Bob incurs slashing penalty as unstaking before staking expiry time
        await bob.sTheo.approve(Staking.address, LARGE_APPROVAL);
        await bob.Staking.unstake(bob.address, [balanceFromGons.toNumber()], false, [0]);

        // Get rewards available for second stake
        const newRewardsForTwo = await Staking.rewardsFor(bob.address, 1);

        // Calculate expected rewards available
        const expectedTotalSlashedTokens = secondAmountToStake * 0.2; // Bob will unstake the second stake immediately (20% penalty on principal)
        const currentSTHEOCirculatingSupply = await sTheo.circulatingSupply();
        const expectedSlashedRewards =
          (secondAmountToStake / currentSTHEOCirculatingSupply.toNumber()) * expectedTotalSlashedTokens;

        expect(newRewardsForTwo).to.equal(expectedSlashedRewards);
      });
    });
  });

  /* ======== End Locked Staking Tranche Tests ======== */

  /* ======== Start Unlocked Staking Tranche Tests ======== */

  describe('Unlocked Tranche', function () {
    describe('Deployment', function () {
      it('is deployed with the correct constructor arguments', async function () {
        const latestBlock = await ethers.provider.getBlock('latest');

        const expectedFirstEpochTime =
          latestBlock.timestamp + (process.env.NODE_ENV === TESTWITHMOCKS ? 60 * 60 * 24 * 30 : epochLength); // Same values as used in deployment script

        const lowerBound = expectedFirstEpochTime * 0.999;
        const upperBound = expectedFirstEpochTime * 1.001;
        expect(await StakingUnlocked.THEO()).to.equal(TheopetraERC20Token.address);
        expect(await StakingUnlocked.sTHEO()).to.equal(sTheoUnlocked.address);

        const epoch: any = await StakingUnlocked.epoch();

        expect(epoch._length).to.equal(BigNumber.from(epochLength));
        expect(epoch.number).to.equal(BigNumber.from(firstEpochNumber));
        expect(Number(epoch.end)).to.be.greaterThan(lowerBound);
        expect(Number(epoch.end)).to.be.lessThan(upperBound);
        expect(Number(await StakingUnlocked.stakingTerm())).to.equal(unlockedStakingTerm);
        expect(await TheopetraAuthority.governor()).to.equal(owner);
      });
    });

    describe('Unstake', function () {
      it('correctly reduces the amount of gons remaining to be redeemed on a Claim, when redeeming a partial amount of the total available, at any time', async function () {
        const [, bob] = users;

        await createClaim(amountToStake, true, false);

        await bob.sTheoUnlocked.approve(StakingUnlocked.address, LARGE_APPROVAL);

        const expectedAmountRemaining = 2_000_000_000;
        const amountToUnStake = amountToStake - expectedAmountRemaining;

        const secondsToMove = randomIntFromInterval(0, 60 * 60 * 24 * 365);
        await moveTimeForward(secondsToMove);

        await StakingUnlocked.stakingInfo(bob.address, 0);
        await bob.StakingUnlocked.unstake(bob.address, [amountToUnStake], false, [0]);

        const firstClaimUpdatedInfo = await StakingUnlocked.stakingInfo(bob.address, 0);
        const expectedGonsRemaining = (await sTheoUnlocked.gonsForBalance(amountToStake)).sub(
          await sTheoUnlocked.gonsForBalance(amountToUnStake)
        );

        expect(firstClaimUpdatedInfo.gonsRemaining).to.equal(expectedGonsRemaining);
        // Can convert gonsRemaing to sTheo amount:
        const redeemableAmountRemaining = await sTheoUnlocked.balanceForGons(firstClaimUpdatedInfo.gonsRemaining);
        // No rebasing with profit has occured in this test, so expect remaining amount to equal that previously defined above
        expect(redeemableAmountRemaining.toNumber()).to.equal(expectedAmountRemaining);
      });

      it('correctly reduces the amount of gons remaining to be redeemed on multiple Claims, when unstaking at any time', async function () {
        const [, bob] = users;

        await createClaim(amountToStake, true, false);
        const secondAmountToStake = 6_000_000_000;
        await createClaim(secondAmountToStake, true, false);

        const secondsToMove = randomIntFromInterval(0, 60 * 60 * 24 * 365);
        await moveTimeForward(secondsToMove);

        await bob.sTheoUnlocked.approve(StakingUnlocked.address, LARGE_APPROVAL);
        const firstAmountToUnstake = amountToStake - 2_000_000_000;
        const secondAmountToUnstake = secondAmountToStake - 1_000_000_000;

        await bob.StakingUnlocked.unstake(bob.address, [firstAmountToUnstake, secondAmountToUnstake], false, [0, 1]);

        const firstClaimUpdatedInfo = await StakingUnlocked.stakingInfo(bob.address, 0);
        const secondClaimUpdatedInfo = await StakingUnlocked.stakingInfo(bob.address, 1);
        const firstExpectedGonsRemaining = (await sTheo.gonsForBalance(amountToStake)).sub(
          await sTheoUnlocked.gonsForBalance(firstAmountToUnstake)
        );
        const secondExpectedGonsRemaining = (await sTheoUnlocked.gonsForBalance(secondAmountToStake)).sub(
          await sTheoUnlocked.gonsForBalance(secondAmountToUnstake)
        );

        expect(firstClaimUpdatedInfo.gonsRemaining).to.equal(firstExpectedGonsRemaining);
        expect(secondClaimUpdatedInfo.gonsRemaining).to.equal(secondExpectedGonsRemaining);
      });

      it('allows a staker to redeem their sTHEO for THEO with zero penalty, at any time', async function () {
        const [, bob] = users;
        const bobStartingTheoBalance = await TheopetraERC20Token.balanceOf(bob.address);

        await createClaim(amountToStake, true, false);

        const secondsToMove = randomIntFromInterval(0, 60 * 60 * 24 * 365);
        await moveTimeForward(secondsToMove);

        const stakingInfo = await StakingUnlocked.stakingInfo(bob.address, 0);
        const latestBlock = await ethers.provider.getBlock('latest');
        expect(stakingInfo.stakingExpiry.toNumber()).to.be.lessThanOrEqual(latestBlock.timestamp);
        await bob.sTheoUnlocked.approve(StakingUnlocked.address, amountToStake);

        await bob.StakingUnlocked.unstake(bob.address, [amountToStake], false, [0]);

        expect(Number(await sTheoUnlocked.balanceOf(bob.address))).to.equal(0);

        const expectedPenalty = 0;
        expect(Number(await TheopetraERC20Token.balanceOf(bob.address))).to.equal(
          bobStartingTheoBalance - expectedPenalty
        );
      });

      it('allows a variety of staking and unstaking (with or without rebasing during unstakes), with movements in time', async function () {
        const [, bob] = users;
        await setupForRebase();
        const rnd = randomIntFromInterval(0, 1);
        const isRebaseTriggered = [true, false][rnd];
        console.log('Is Rebase triggered when unstaking against final Claim?', isRebaseTriggered);

        await createClaim(amountToStake, true, false);
        await createClaim(amountToStake * 1000, true, false);
        await moveTimeForward(9 * 60 * 60); // move into next epoch to ensure a rebase
        await createClaim(amountToStake * 2, false, false);
        const [, , , , gonsRemainingOne] = await StakingUnlocked.stakingInfo(bob.address, 0);
        const balanceFromGonsOne = await sTheoUnlocked.balanceForGons(gonsRemainingOne);
        const [, , , , gonsRemainingTwo] = await StakingUnlocked.stakingInfo(bob.address, 1);
        const balanceFromGonsTwo = await sTheoUnlocked.balanceForGons(gonsRemainingTwo);
        await bob.sTheoUnlocked.approve(StakingUnlocked.address, LARGE_APPROVAL);
        await bob.StakingUnlocked.unstake(bob.address, [balanceFromGonsOne.toNumber()], false, [0]);
        await bob.StakingUnlocked.unstake(bob.address, [balanceFromGonsTwo.toNumber()], true, [1]);
        await createClaim(amountToStake * 3, true, false);
        const [, , , , gonsRemainingFour] = await StakingUnlocked.stakingInfo(bob.address, 3);
        const balanceFromGonsFour = await sTheoUnlocked.balanceForGons(gonsRemainingFour);
        await bob.StakingUnlocked.unstake(bob.address, [balanceFromGonsFour.toNumber()], isRebaseTriggered, [3]);
      });

      it('allows a user to unstake for the correct amount after a rebase during unstaking', async function () {
        const [, bob] = users;
        await sTheoUnlocked.setIndex(10);
        await setupForRebase();
        // STAKE
        // Already in next epoch so rebase will occur when staking, but Profit will be zero at this point
        await createClaim(amountToStake, true, false);
        await createClaim(amountToStake * 1000, true, false);
        const secondsToMove = randomIntFromInterval(0, 60 * 60 * 24 * 365);
        await moveTimeForward(secondsToMove);

        const [, , , , gonsRemaining] = await StakingUnlocked.stakingInfo(bob.address, 0);
        const balanceFromGons = await sTheoUnlocked.balanceForGons(gonsRemaining);
        const bobTheoBalance = await TheopetraERC20Token.balanceOf(bob.address);

        // UNSTAKE
        await bob.sTheoUnlocked.approve(StakingUnlocked.address, LARGE_APPROVAL);
        await bob.StakingUnlocked.unstake(bob.address, [balanceFromGons.toNumber()], true, [0]); // Set _trigger for rebase to be true, to cause rebase (with non-zero profit)
        const bobFinalTheoBalance = await TheopetraERC20Token.balanceOf(bob.address);
        const rewards = bobFinalTheoBalance.sub(balanceFromGons.add(bobTheoBalance));

        expect(rewards.toNumber()).to.greaterThan(0);

        // Rewards should be the difference between sTheo balance before and after rebase
        const newSTheoValueFromBalance = await sTheoUnlocked.balanceForGons(gonsRemaining);
        expect(rewards).to.equal(newSTheoValueFromBalance.sub(balanceFromGons));
      });
    });
  });
});
