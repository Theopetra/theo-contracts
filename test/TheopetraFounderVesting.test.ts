import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';
import { moveTimeForward, setupUsers } from './utils';
import { CAPTABLE, CONTRACTS, INITIALMINT, UNLOCKSCHEDULE } from '../utils/constants';
import { getContracts } from '../utils/helpers';

const badAddress = '0x0000000000000000000000000000000000001234';

const setup = deployments.createFixture(async function () {
  await deployments.fixture([CONTRACTS.founderVesting]);

  const { deployer: owner } = await getNamedAccounts();
  const contracts = await getContracts();

  const users = await setupUsers(await getUnnamedAccounts(), contracts);

  return {
    ...contracts,
    users,
    owner,
  };
});

describe('Theopetra Founder Vesting', function () {
  let TheopetraFounderVesting: any;
  let TheopetraTreasury: any;
  let TheopetraERC20Token: any;

  let owner: any;

  beforeEach(async function () {
    ({
      FounderVesting: TheopetraFounderVesting,
      TheopetraTreasury,
      TheopetraERC20Token,
      owner,
    } = await setup());
  });

  describe('Deployment', function () {
    it('can be deployed', async function () {
      expect(TheopetraFounderVesting).to.not.be.undefined;
    });
    it('mints tokens to cover the input shares', async function () {
      const totalShares = CAPTABLE.shares.reduce((acc, curr) => acc.add(curr), ethers.constants.Zero);
      const expectedMint = totalShares.mul(INITIALMINT).div(10**(await TheopetraFounderVesting.decimals()));
      expect(await TheopetraERC20Token.balanceOf(TheopetraFounderVesting.address)).to.equal(expectedMint);
    });
    it('credits the value of the initial mint to the contract itself', async function () {
      const totalShares = CAPTABLE.shares.reduce((acc, curr) => acc.add(curr), ethers.constants.Zero);
      const expectedMint = totalShares.mul(INITIALMINT).div(10**(await TheopetraFounderVesting.decimals()));
      expect(await TheopetraERC20Token.balanceOf(TheopetraFounderVesting.address)).to.equal(expectedMint);
    });
    it('sets total released THEO tokens to 0', async function () {
      const totalReleased = await TheopetraFounderVesting.getTotalReleased(TheopetraERC20Token.address);
      expect(totalReleased).to.equal(ethers.constants.Zero);
    })
  });

  describe('decimals', function () {
    it('returns 9', async function () {
      const decimals = await TheopetraFounderVesting.decimals();
      expect(decimals).to.equal(9);
    });
  });

  describe('getTotalShares', function() {
    it('returns the sum of all shares', async function() {
      const totalShares = await TheopetraFounderVesting.getTotalShares();
      const expectedShares = CAPTABLE.shares.reduce((acc, curr) => acc.add(curr), ethers.constants.Zero);
      expect(totalShares).to.equal(expectedShares);
    });
  });

  describe('getShares', function() {
    it('returns the number of shares for a given account', async function() {
      const acctShares = await TheopetraFounderVesting.getShares(CAPTABLE.addresses[0]);
      const expectedShares = CAPTABLE.shares[0];
      expect(acctShares).to.equal(expectedShares);
    });
    it('returns 0 for a unknown account', async function() {
      const acctShares = await TheopetraFounderVesting.getShares(badAddress);
      expect(acctShares).to.equal(0);
    });
  });

  describe('getReleased', function() {
    beforeEach(async function() {
      // move forward 1 hour past unlock schedule
      await moveTimeForward(UNLOCKSCHEDULE.times[UNLOCKSCHEDULE.times.length - 1] + 3600);
    });
    it('returns 0 if nothing has been released', async function() {
      const released = await TheopetraFounderVesting.getReleased(TheopetraERC20Token.address, CAPTABLE.addresses[0]);
      expect(released).to.equal(ethers.constants.Zero);
    });
    it('returns quantity of released tokens if tokens has been released', async function() {
      const totalBalance = await TheopetraERC20Token.balanceOf(TheopetraFounderVesting.address);
      const totalShares = CAPTABLE.shares.reduce((acc, curr) => acc.add(curr), ethers.constants.Zero);
      const expectedReleased = totalBalance.mul(CAPTABLE.shares[0]).div(totalShares);

      await TheopetraFounderVesting.release(TheopetraERC20Token.address, CAPTABLE.addresses[0]);
      const released = await TheopetraFounderVesting.getReleased(TheopetraERC20Token.address, CAPTABLE.addresses[0]);
      expect(released).to.equal(expectedReleased);
    });
  });

  describe('release', function() {
    beforeEach(async function() {
      // move forward 1 hour past unlock schedule
      await moveTimeForward(UNLOCKSCHEDULE.times[UNLOCKSCHEDULE.times.length - 1] + 3600);
    });
   it('reverts if no shares designated to address', async function() {
      expect(TheopetraFounderVesting.release(TheopetraERC20Token.address, badAddress)).to.be.revertedWith("TheopetraFounderVesting: account has no shares");
    });
    it('reverts if no payment due to address', async function() {
      // clean out initial funds
      await TheopetraFounderVesting.release(TheopetraERC20Token.address, CAPTABLE.addresses[0]);
      // Trying again should fail
      expect(TheopetraFounderVesting.release(TheopetraERC20Token.address, CAPTABLE.addresses[0])).to.be.revertedWith("TheopetraFounderVesting: account is not due payment");
    });
    it('increases total released', async function() {
      const expectedReleased = ethers.BigNumber.from(INITIALMINT).mul(CAPTABLE.shares[0]).div(10**(await TheopetraFounderVesting.decimals()));
      const initialReleased = await TheopetraFounderVesting.getTotalReleased(TheopetraERC20Token.address);

      await TheopetraFounderVesting.release(TheopetraERC20Token.address, CAPTABLE.addresses[0]);
      const totalReleased = await TheopetraFounderVesting.getTotalReleased(TheopetraERC20Token.address);

      expect(initialReleased).to.equal(0);
      expect(totalReleased).to.equal(expectedReleased);
    });
    it('increases balance of address', async function() {
      const expectedReleased = ethers.BigNumber.from(INITIALMINT).mul(CAPTABLE.shares[0]).div(10**(await TheopetraFounderVesting.decimals()));
      const initialBalance = await TheopetraERC20Token.balanceOf(CAPTABLE.addresses[0]);

      await TheopetraFounderVesting.release(TheopetraERC20Token.address, CAPTABLE.addresses[0]);
      const releasedBalance = await TheopetraERC20Token.balanceOf(CAPTABLE.addresses[0]);

      expect(initialBalance).to.equal(0);
      expect(releasedBalance).to.equal(expectedReleased);
    });
    it('emits an event', async function() {
      const expectedReleased = ethers.BigNumber.from(INITIALMINT).mul(CAPTABLE.shares[0]).div(10**(await TheopetraFounderVesting.decimals()));

      await expect(TheopetraFounderVesting.release(TheopetraERC20Token.address, CAPTABLE.addresses[0]))
          .to.emit(TheopetraFounderVesting, 'ERC20PaymentReleased')
          .withArgs(TheopetraERC20Token.address, CAPTABLE.addresses[0], expectedReleased);
    });
  });

  describe('scheduled release', function() {
    it('reverts if no payment due to address at deploy time', async function() {
      // Attempting release at time 0 should fail
      expect(TheopetraFounderVesting.release(TheopetraERC20Token.address, CAPTABLE.addresses[0])).to.be.revertedWith("TheopetraFounderVesting: account is not due payment");
    });
    it('increases balance of address by full shares after full schedule', async function() {
      const expectedReleased = ethers.BigNumber.from(INITIALMINT).mul(CAPTABLE.shares[0]).div(10**(await TheopetraFounderVesting.decimals()));
      const initialBalance = await TheopetraERC20Token.balanceOf(CAPTABLE.addresses[0]);
      await moveTimeForward(UNLOCKSCHEDULE.times[UNLOCKSCHEDULE.times.length - 1] + 3600);

      await TheopetraFounderVesting.release(TheopetraERC20Token.address, CAPTABLE.addresses[0]);
      const releasedBalance = await TheopetraERC20Token.balanceOf(CAPTABLE.addresses[0]);

      expect(initialBalance).to.equal(0);
      expect(releasedBalance).to.equal(expectedReleased);
    });
    it('increases balance of address proportionally to the time in the schedule', async function() {
      const travelTime = UNLOCKSCHEDULE.times[2] + 3600;
      const unlockedMultiplier = UNLOCKSCHEDULE.amounts[2];
      const expectedReleased = ethers.BigNumber.from(INITIALMINT)
          .mul(CAPTABLE.shares[0]).mul(unlockedMultiplier)
          .div(10**(await TheopetraFounderVesting.decimals())).div(10**(await TheopetraFounderVesting.decimals()));
      const initialBalance = await TheopetraERC20Token.balanceOf(CAPTABLE.addresses[0]);

      await moveTimeForward(travelTime);

      await TheopetraFounderVesting.release(TheopetraERC20Token.address, CAPTABLE.addresses[0]);
      const releasedBalance = await TheopetraERC20Token.balanceOf(CAPTABLE.addresses[0]);

      expect(initialBalance).to.equal(0);
      expect(releasedBalance).to.equal(expectedReleased);
    });
  });

  describe('releaseAmount', function() {
    beforeEach(async function() {
      // move forward 1 hour past unlock schedule
      await moveTimeForward(UNLOCKSCHEDULE.times[UNLOCKSCHEDULE.times.length - 1] + 3600);
    });
    it('reverts if no shares designated to address', async function() {
      expect(TheopetraFounderVesting.releaseAmount(TheopetraERC20Token.address, badAddress, 1)).to.be.revertedWith("TheopetraFounderVesting: account has no shares");
    });
    it('reverts if amount is 0', async function() {
      expect(TheopetraFounderVesting.releaseAmount(TheopetraERC20Token.address, badAddress, 0)).to.be.revertedWith("TheopetraFounderVesting: amount cannot be 0");
    });
    it('reverts if no payment due to address', async function() {
      // clean out initial funds
      await TheopetraFounderVesting.release(TheopetraERC20Token.address, CAPTABLE.addresses[0]);
      // Trying again should fail
      expect(TheopetraFounderVesting.releaseAmount(TheopetraERC20Token.address, CAPTABLE.addresses[0], 1)).to.be.revertedWith("TheopetraFounderVesting: account is not due payment");
    });
    it('reverts if amount is greater than amount due', async function() {
      const reallyBigAmount = 1_000_000_000_000_000_000_000_000;
      expect(TheopetraFounderVesting.releaseAmount(TheopetraERC20Token.address, badAddress, reallyBigAmount)).to.be.revertedWith("TheopetraFounderVesting: requested amount is more than due payment for account");
    });
    it('increases total released', async function() {
      const expectedReleased = 100;
      const initialReleased = await TheopetraFounderVesting.getTotalReleased(TheopetraERC20Token.address);

      await TheopetraFounderVesting.releaseAmount(TheopetraERC20Token.address, CAPTABLE.addresses[0], expectedReleased);
      const totalReleased = await TheopetraFounderVesting.getTotalReleased(TheopetraERC20Token.address);

      expect(initialReleased).to.equal(0);
      expect(totalReleased).to.equal(expectedReleased);
    });
    it('increases balance of address', async function() {
      const expectedReleased = 100;
      const initialBalance = await TheopetraERC20Token.balanceOf(CAPTABLE.addresses[0]);

      await TheopetraFounderVesting.releaseAmount(TheopetraERC20Token.address, CAPTABLE.addresses[0], expectedReleased);
      const releasedBalance = await TheopetraERC20Token.balanceOf(CAPTABLE.addresses[0]);

      expect(initialBalance).to.equal(0);
      expect(releasedBalance).to.equal(expectedReleased);
    });
    it('emits an event', async function() {
      const expectedReleased = 100;

      await expect(TheopetraFounderVesting.releaseAmount(TheopetraERC20Token.address, CAPTABLE.addresses[0], expectedReleased))
          .to.emit(TheopetraFounderVesting, 'ERC20PaymentReleased')
          .withArgs(TheopetraERC20Token.address, CAPTABLE.addresses[0], expectedReleased);
    });
  });

  describe('scheduled releaseAmount', function() {
    it('reverts if no payment due to address at deploy time', async function() {
      // Attempting release at time 0 should fail
      expect(TheopetraFounderVesting.releaseAmount(TheopetraERC20Token.address, CAPTABLE.addresses[0], 100)).to.be.revertedWith("TheopetraFounderVesting: account is not due payment");
    });
    it('increases balance of address by full shares after full schedule', async function() {
      const expectedReleased = 100;
      const initialBalance = await TheopetraERC20Token.balanceOf(CAPTABLE.addresses[0]);
      await moveTimeForward(UNLOCKSCHEDULE.times[UNLOCKSCHEDULE.times.length - 1] + 3600);

      await TheopetraFounderVesting.releaseAmount(TheopetraERC20Token.address, CAPTABLE.addresses[0], expectedReleased);
      const releasedBalance = await TheopetraERC20Token.balanceOf(CAPTABLE.addresses[0]);

      expect(initialBalance).to.equal(0);
      expect(releasedBalance).to.equal(expectedReleased);
    });
    it('increases balance of address proportionally to the time in the schedule', async function() {
      const travelTime = UNLOCKSCHEDULE.times[2] + 3600;
      const expectedReleased = 100;
      const initialBalance = await TheopetraERC20Token.balanceOf(CAPTABLE.addresses[0]);

      await moveTimeForward(travelTime);

      await TheopetraFounderVesting.releaseAmount(TheopetraERC20Token.address, CAPTABLE.addresses[0], expectedReleased);
      const releasedBalance = await TheopetraERC20Token.balanceOf(CAPTABLE.addresses[0]);

      expect(initialBalance).to.equal(0);
      expect(releasedBalance).to.equal(expectedReleased);
    });
  });

  describe('getReleasable', function() {
    beforeEach(async function() {
      // move forward 1 hour past unlock schedule
      await moveTimeForward(UNLOCKSCHEDULE.times[UNLOCKSCHEDULE.times.length - 1] + 3600);
    });
    it('reverts if no shares designated to address', async function() {
      expect(TheopetraFounderVesting.getReleasable(TheopetraERC20Token.address, badAddress, 1)).to.be.revertedWith("TheopetraFounderVesting: account has no shares");
    });
    it('returns 0 if no payment is due', async function() {
      await TheopetraFounderVesting.release(TheopetraERC20Token.address, CAPTABLE.addresses[0]);
      const releasable = await TheopetraFounderVesting.getReleasable(TheopetraERC20Token.address, CAPTABLE.addresses[0]);
      expect(releasable).to.equal(ethers.constants.Zero);
    });
    it('returns quantity of releasable tokens if tokens are due', async function() {
      const totalBalance = await TheopetraERC20Token.balanceOf(TheopetraFounderVesting.address);
      const totalShares = CAPTABLE.shares.reduce((acc, curr) => acc.add(curr), ethers.constants.Zero);
      const expectedReleasable = totalBalance.mul(CAPTABLE.shares[0]).div(totalShares);

      const releasable = await TheopetraFounderVesting.getReleasable(TheopetraERC20Token.address, CAPTABLE.addresses[0]);
      expect(releasable).to.equal(expectedReleasable);
    });
  });

  describe('scheduled getReleasable', function() {
    it('returns balance of address with full shares after full schedule', async function() {
      const expectedReleasable = ethers.BigNumber.from(INITIALMINT).mul(CAPTABLE.shares[0]).div(10**(await TheopetraFounderVesting.decimals()));
      await moveTimeForward(UNLOCKSCHEDULE.times[UNLOCKSCHEDULE.times.length - 1] + 3600);

      const releasedBalance = await TheopetraFounderVesting.getReleasable(TheopetraERC20Token.address, CAPTABLE.addresses[0]);

      expect(releasedBalance).to.equal(expectedReleasable);
    });
    it('returns balance of address proportionally to the time in the schedule', async function() {
      const travelTime = UNLOCKSCHEDULE.times[2] + 3600;
      const unlockedMultiplier = UNLOCKSCHEDULE.amounts[2];
      const expectedReleasable = ethers.BigNumber.from(INITIALMINT)
          .mul(CAPTABLE.shares[0]).mul(unlockedMultiplier)
          .div(10**(await TheopetraFounderVesting.decimals())).div(10**(await TheopetraFounderVesting.decimals()));

      await moveTimeForward(travelTime);

      const releasedBalance = await TheopetraFounderVesting.getReleasable(TheopetraERC20Token.address, CAPTABLE.addresses[0]);

      expect(releasedBalance).to.equal(expectedReleasable);
    });
  });
});
