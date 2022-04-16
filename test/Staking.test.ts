import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';
import { BigNumber } from 'ethers';

import { setupUsers, moveTimeForward } from './utils';
import { getContracts } from '../utils/helpers';
import { CONTRACTS, TESTWITHMOCKS } from '../utils/constants';

const setup = deployments.createFixture(async () => {
  await deployments.fixture();
  const { deployer: owner } = await getNamedAccounts();

  const contracts = { ...(await getContracts(CONTRACTS.staking)) };

  const users = await setupUsers(await getUnnamedAccounts(), contracts);

  return {
    ...contracts,
    users,
    owner,
    addressZero: ethers.utils.getAddress('0x0000000000000000000000000000000000000000'),
  };
});

describe.only('Staking', function () {
  const amountToStake = 1000;
  const LARGE_APPROVAL = '100000000000000000000000000000000';

  let Staking: any;
  let sTheo: any;
  let TheopetraAuthority: any;
  let TheopetraERC20Token: any;
  let Treasury: any;
  let users: any;
  let owner: any;
  let addressZero: any;
  const unlockedStakingTerm = 0;
  const lockedStakingTerm = 31536000;

  async function createClaim() {
    const [, bob] = users;
    const claim = false;

    await bob.Staking.stake(bob.address, amountToStake, claim);
  }

  beforeEach(async function () {
    ({ Staking, sTheo, TheopetraAuthority, TheopetraERC20Token, Treasury, users, owner, addressZero } = await setup());

    const [, bob, carol] = users;
    // Setup to mint initial amount of THEO
    const [, treasurySigner] = await ethers.getSigners();
    if (process.env.NODE_ENV !== TESTWITHMOCKS) {
      await TheopetraAuthority.pushVault(treasurySigner.address, true); // Use a valid signer for Vault
      await TheopetraERC20Token.connect(treasurySigner).mint(bob.address, '10000000000000000'); // 1e16 Set to be same as return value in Treasury Mock for baseSupply
      await TheopetraAuthority.pushVault(Treasury.address, true); // Restore Treasury contract as Vault
    } else {
      await TheopetraERC20Token.mint(bob.address, '10000000000000');
    }
    await bob.TheopetraERC20Token.approve(Staking.address, LARGE_APPROVAL);
    await carol.TheopetraERC20Token.approve(Staking.address, LARGE_APPROVAL);

    if (process.env.NODE_ENV === TESTWITHMOCKS) {
      // Mint enough to allow transfers when claiming staked THEO
      // only call this if not performing full testing, as only mock sTheo has a mint function (sTheo itself uses `initialize` instead)
      await sTheo.mint(Staking.address, '1000000000000000000000');
    }
  });

  describe('Deployment', async function () {
    const epochLength = 8 * 60 * 60; // Same value as used in deployment script for Hardhat network deployment
    const firstEpochNumber = 1; // Same value as used in deployment script for Hardhat network deployment

    it('can be deployed', async function () {
      await setup();
    });

    it('is deployed with the correct constructor arguments', async function () {
      const latestBlock = await ethers.provider.getBlock('latest');
      const lowerBound = latestBlock.timestamp * 0.999 + epochLength;
      const upperBound = latestBlock.timestamp * 1.001 + epochLength;
      expect(await Staking.THEO()).to.equal(TheopetraERC20Token.address);
      expect(await Staking.sTHEO()).to.equal(sTheo.address);

      const epoch = await Staking.epoch();

      expect(epoch._length).to.equal(BigNumber.from(epochLength));
      expect(epoch.number).to.equal(BigNumber.from(firstEpochNumber));
      expect(Number(epoch.end)).to.be.greaterThan(lowerBound);
      expect(Number(epoch.end)).to.be.lessThan(upperBound);

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
      expect(stakingInfo.gonsInWarmup.toNumber()).to.equal(expectedGonsInWarmup);

      const latestBlock = await ethers.provider.getBlock('latest');
      expect(stakingInfo.warmupExpiry.toNumber()).to.equal(latestBlock.timestamp); // zero warmup period
      const upperBound = (latestBlock.timestamp + 31536000) * 1.0033; // Using seconds in a year, as currently used in deploy script
      const lowerBound = (latestBlock.timestamp + 31536000) * 0.9967; // Using seconds in a year, as currently used in deploy script
      expect(stakingInfo.stakingExpiry.toNumber()).to.be.lessThan(upperBound);
      expect(stakingInfo.stakingExpiry.toNumber()).to.be.greaterThan(lowerBound);

      expect(stakingInfo.inWarmup).to.equal(true);
    });

    it('adds to the `total supply in warmup`, which represents the total amount of sTHEO currently in warmup', async function () {
      const [, bob] = users;
      const claim = false;

      expect(await Staking.supplyInWarmup()).to.equal(0);

      await bob.Staking.stake(bob.address, amountToStake, claim);
      expect(await Staking.supplyInWarmup()).to.equal(amountToStake); // sTheo.gonsForBalance(amount) returns amount
    });

    it('allows the staker to claim sTHEO immediately if `_claim` is true and warmup is zero', async function () {
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

      expect(stakingInfo.inWarmup).to.equal(false);
    });

    it('can add multiple claims where `_claim` is true and warmup is zero', async function () {
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
    it('allows a staker to redeem their sTHEO for THEO', async function () {
      const [, bob] = users;
      const claim = true;

      const bobStartingTheoBalance = Number(await TheopetraERC20Token.balanceOf(bob.address));

      await bob.Staking.stake(bob.address, amountToStake, claim);

      expect(Number(await TheopetraERC20Token.balanceOf(bob.address))).to.equal(bobStartingTheoBalance - amountToStake);
      expect(Number(await sTheo.balanceOf(bob.address))).to.equal(amountToStake);

      await bob.sTheo.approve(Staking.address, amountToStake);
      await bob.Staking.unstake(bob.address, amountToStake, false, [0]);

      expect(Number(await sTheo.balanceOf(bob.address))).to.equal(0);
      expect(Number(await TheopetraERC20Token.balanceOf(bob.address))).to.equal(bobStartingTheoBalance);
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

    it('allows a recipient to claim sTHEO from warmup, when warmup period is non-zero, after the warmup period has passed', async function () {
      const [, bob] = users;
      await Staking.setWarmup(60 * 60 * 24 * 7); // Set warmup to be 7 days

      await createClaim();
      expect(await sTheo.balanceOf(bob.address)).to.equal(0);

      await moveTimeForward(60 * 60 * 24 * 7 + 60); // Move time past warmup period
      await bob.Staking.claim(bob.address, [0]);
      expect(await sTheo.balanceOf(bob.address)).to.equal(amountToStake);
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

  describe('isUnClaimed', function () {
    it('will return true for a claim that is in warmup', async function () {
      const [, bob] = users;
      await Staking.setWarmup(60 * 60 * 24 * 5); // Set warmup to be 5 days
      await createClaim();

      expect(await Staking.isUnClaimed(bob.address, 0)).to.equal(true);
    });

    it('will return true for a claim that is out of warmup but that has not yet been claimed', async function() {
      const [, bob] = users;
      await createClaim(); // zero warmup

      expect(await Staking.isUnClaimed(bob.address, 0)).to.equal(true);
    })

    it('will return false for a claim that has been claimed', async function() {
      const [, bob] = users;
      await createClaim(); // zero warmup

      await bob.Staking.claim(bob.address, [0]);
      expect(await Staking.isUnClaimed(bob.address, 0)).to.equal(false);
    })
  });

  describe('indexesFor', function () {
    it('returns the indexes of un-claimed claims', async function () {
      const [, bob] = users;
      await createClaim();
      await createClaim();
      await createClaim();

      await bob.Staking.claim(bob.address, [1]);
      const response = await Staking.indexesFor(bob.address);
      const returnedIndexes = response.map((element: any) => element.toNumber());
      const expectedIndexes = [0,2];
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

      await expect(carol.Staking.claim(bob.address, [0])).to.be.revertedWith('External claims for account are locked');
    });

    it('allows an external claim to be made for sTHEO, if the receipient has toggled their Claim lock', async function () {
      const [, bob, carol] = users;
      await createClaim(); // Create a claim for Bob

      await bob.Staking.toggleLock();
      await moveTimeForward(60 * 60 * 9); // Move time forward into the next epoch to allow claim amount to be sent

      await expect(carol.Staking.claim(bob.address, [0])).to.not.be.reverted;
      expect(await sTheo.balanceOf(bob.address)).to.equal(amountToStake);
    });

    it('allows an internal claim after the recipient has toggled the Claim lock', async function () {
      const [, bob] = users;
      await createClaim(); // Create a claim for Bob

      await bob.Staking.toggleLock();
      await moveTimeForward(60 * 60 * 9); // Move time forward into the next epoch to allow claim amount to be sent

      await bob.Staking.claim(bob.address, [0]);
      expect(await sTheo.balanceOf(bob.address)).to.equal(amountToStake);
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
});
