import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';
import { BigNumber } from 'ethers';

import { setupUsers } from './utils';
import { CONTRACTS, MOCKS } from '../utils/constants';

const setup = deployments.createFixture(async () => {
  await deployments.fixture([CONTRACTS.staking, CONTRACTS.authority, MOCKS.theoTokenMock, MOCKS.sTheoMock]);
  const { deployer: owner } = await getNamedAccounts();

  const contracts = {
    Staking: await ethers.getContract(CONTRACTS.staking),
    sTheoMock: await ethers.getContract(MOCKS.sTheoMock),
    TheopetraAuthority: await ethers.getContract(CONTRACTS.authority),
    TheopetraERC20Mock: await ethers.getContract(MOCKS.theoTokenMock),
  };

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
  let sTheoMock: any;
  let TheopetraAuthority: any;
  let TheopetraERC20Mock: any;
  let users: any;
  let owner: any;
  let addressZero: any;
  const stakingTerm: any = 0;

  beforeEach(async function () {
    ({ Staking, sTheoMock, TheopetraAuthority, TheopetraERC20Mock, users, owner, addressZero } = await setup());

    const [, bob, carol] = users;

    await TheopetraERC20Mock.mint(bob.address, '10000000000000');
    await bob.TheopetraERC20Mock.approve(Staking.address, LARGE_APPROVAL);
    await carol.TheopetraERC20Mock.approve(Staking.address, LARGE_APPROVAL);

    // Mint enough to allow transfers when claiming staked THEO
    await sTheoMock.mint(Staking.address, '1000000000000000000000');
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
      expect(await Staking.THEO()).to.equal(TheopetraERC20Mock.address);
      expect(await Staking.sTHEO()).to.equal(sTheoMock.address);

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
          args: [addressZero, owner, epochLength, firstEpochNumber, firstEpochTime, TheopetraAuthority.address],
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
          args: [owner, addressZero, epochLength, firstEpochNumber, firstEpochTime, TheopetraAuthority.address],
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

  describe('stake', function () {
    it.only('adds a Claim for the staked _amount to the staked collection when `_claim` is false and `warmupPeriod` is zero', async function () {
      const [, bob] = users;
      const claim = false;

      await bob.Staking.stake(bob.address, amountToStake, true);

      const warmupInfo = await Staking.stakingInfo(bob.address, 0);

      const epochInfo = await Staking.epoch();
      expect(warmupInfo.deposit.toNumber()).to.equal(amountToStake);
      // expect(warmupInfo.gons.toNumber()).to.equal(amountToStake); // sTheoMock.gonsForBalance() just returns amount
      // expect(warmupInfo.lock.toNumber()).to.equal(false);
    });

    it('adds to the `total supply in warmup`, which represents the total amount of sTHEO currently in warmup', async function () {
      const [, bob] = users;
      const claim = false;

      expect(await Staking.supplyInWarmup()).to.equal(0);

      await bob.Staking.stake(bob.address, amountToStake, claim);
      expect(await Staking.supplyInWarmup()).to.equal(amountToStake); // sTheoMock.gonsForBalance(amount) returns amount
    });

    it('allows the staker to claim sTHEO immediately if `_claim` is true and warmup is zero', async function () {
      const [, bob] = users;
      const claim = true;

      expect(await sTheoMock.balanceOf(bob.address)).to.equal(0);

      await bob.Staking.stake(bob.address, amountToStake, claim);

      expect(await sTheoMock.balanceOf(bob.address)).to.equal(amountToStake);
      expect(await Staking.supplyInWarmup()).to.equal(0);
    });

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

    it('adds a Claim in warmup, with the correct deposit and expiry, when `_claim` is true and the warmup period is greater than 0', async function () {
      const [, bob] = users;
      const claim = true;
      const warmupPeriod = 5;

      await Staking.setWarmup(warmupPeriod);
      expect(await Staking.warmupPeriod()).to.equal(5);

      await bob.Staking.stake(bob.address, amountToStake, claim);

      expect(await Staking.supplyInWarmup()).to.equal(amountToStake);

      const warmupInfo = await Staking.stakingInfo(bob.address);
      const epochInfo = await Staking.epoch();

      expect(warmupInfo.deposit).to.equal(amountToStake);
      expect(warmupInfo.expiry).to.equal(Number(epochInfo.number) + warmupPeriod);
    });

    it('includes a toggle for locking Claims (to prevent new deposits or claims to/from external address)', async function () {
      const [, bob] = users;

      await bob.Staking.toggleLock();
      const warmupInfo = await Staking.warmupInfo(bob.address);
      expect(warmupInfo.lock).to.equal(true);
    });

    it('prevents an external deposit by default', async function () {
      const [, bob, carol] = users;
      const claim = false;

      await expect(bob.Staking.stake(carol.address, amountToStake, claim)).to.be.revertedWith(
        'External deposits for account are locked'
      );
    });

    it('allows an external deposit when recipient toggles their Claim lock', async function () {
      const [, bob, carol] = users;
      const claim = false;

      await carol.Staking.toggleLock();

      await bob.Staking.stake(carol.address, amountToStake, claim);

      expect(await Staking.supplyInWarmup()).to.equal(amountToStake);

      const warmupInfo = await Staking.warmupInfo(carol.address);
      expect(warmupInfo.deposit).to.equal(amountToStake);
    });

    it('allows self-deposits (while preventing external deposits by default)', async function () {
      const [, bob, carol] = users;
      const claim = false;

      await expect(bob.Staking.stake(carol.address, amountToStake, claim)).to.be.revertedWith(
        'External deposits for account are locked'
      );
      await bob.Staking.stake(bob.address, amountToStake, claim);

      expect(await Staking.supplyInWarmup()).to.equal(amountToStake);
    });
  });

  describe('Unstake', function () {
    it('allows a staker to redeem their sTHEO for THEO', async function () {
      const [, bob] = users;
      const claim = true;

      const bobStartingTheoBalance = Number(await TheopetraERC20Mock.balanceOf(bob.address));

      await bob.Staking.stake(bob.address, amountToStake, claim);

      expect(await TheopetraERC20Mock.balanceOf(bob.address)).to.equal(bobStartingTheoBalance - amountToStake);
      expect(await sTheoMock.balanceOf(bob.address)).to.equal(amountToStake);

      await bob.sTheoMock.approve(Staking.address, amountToStake);
      await bob.Staking.unstake(bob.address, amountToStake, false);

      expect(await sTheoMock.balanceOf(bob.address)).to.equal(0);
      expect(await TheopetraERC20Mock.balanceOf(bob.address)).to.equal(bobStartingTheoBalance);
    });
  });

  describe('claim', function () {
    async function createClaim() {
      const [, bob] = users;
      const claim = false;

      await bob.Staking.stake(bob.address, amountToStake, claim);
    }

    it('allows a recipient to claim sTHEO from warmup', async function () {
      const [, bob] = users;
      await createClaim();
      expect(await sTheoMock.balanceOf(bob.address)).to.equal(0);

      await bob.Staking.claim(bob.address);
      expect(await sTheoMock.balanceOf(bob.address)).to.equal(amountToStake);
    });

    it('prevents an external claim by default', async function () {
      const [, bob, carol] = users;
      await createClaim();

      await expect(carol.Staking.claim(bob.address)).to.be.revertedWith('External claims for account are locked');
    });

    it('allows an external claim to be made for sTHEO, if the receipient has toggled their Claim lock', async function () {
      const [, bob, carol] = users;
      await createClaim();

      await bob.Staking.toggleLock();

      await carol.Staking.claim(bob.address);
      expect(await sTheoMock.balanceOf(bob.address)).to.equal(amountToStake);
    });

    it('allows an internal claim after the recipient has toggled the Claim lock', async function () {
      const [, bob] = users;
      await createClaim();

      await bob.Staking.toggleLock();

      await bob.Staking.claim(bob.address);
      expect(await sTheoMock.balanceOf(bob.address)).to.equal(amountToStake);
    });

    it('does not transfer any sTHEO when there is no claim', async function () {
      const [, bob] = users;

      expect(await sTheoMock.balanceOf(bob.address)).to.equal(0);
      await bob.Staking.claim(bob.address);
      expect(await sTheoMock.balanceOf(bob.address)).to.equal(0);
    });

    it('does not transfer any sTHEO while the claim is still in warmup', async function () {
      const [, bob] = users;
      await Staking.setWarmup(2);
      await createClaim();

      await bob.Staking.claim(bob.address);
      expect(await Staking.supplyInWarmup()).to.equal(amountToStake);
      expect(await sTheoMock.balanceOf(bob.address)).to.equal(0);
    });
  });
});
