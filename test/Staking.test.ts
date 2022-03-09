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

describe('Staking', function () {
  const amountToStake = 1000;
  const LARGE_APPROVAL = '100000000000000000000000000000000';

  let Staking: any;
  let sTheoMock: any;
  let TheopetraAuthority: any;
  let TheopetraERC20Mock: any;
  let users: any;
  let owner: any;
  let addressZero: any;

  beforeEach(async function () {
    ({ Staking, sTheoMock, TheopetraAuthority, TheopetraERC20Mock, users, owner, addressZero } = await setup());

    const [, bob, carol] = users;

    await TheopetraERC20Mock.mint(bob.address, '10000000000000');
    await bob.TheopetraERC20Mock.approve(Staking.address, LARGE_APPROVAL);
    await carol.TheopetraERC20Mock.approve(Staking.address, LARGE_APPROVAL);

    // Mint enough to allow transfers when claiming staked THEO
    await sTheoMock.mint(Staking.address, '1000000000000000000000');
  });

  describe('Deployment', function () {
    const epochLengthInBlocks = 2000; // Same value as used in deployment script for Hardhat network deployment
    const firstEpochNumber = 1; // Same value as used in deployment script for Hardhat network deployment
    const firstEpochBlock = 10000; // Same value as used in deployment script for Hardhat network deployment

    it('can be deployed', async function () {
      await setup();
    });

    it('is deployed with the correct constructor arguments', async function () {
      expect(await Staking.THEO()).to.equal(TheopetraERC20Mock.address);
      expect(await Staking.sTHEO()).to.equal(sTheoMock.address);

      const epoch = await Staking.epoch();

      expect(epoch._length).to.equal(BigNumber.from(epochLengthInBlocks));
      expect(epoch.number).to.equal(BigNumber.from(firstEpochNumber));
      expect(epoch.endBlock).to.equal(BigNumber.from(firstEpochBlock));

      expect(await TheopetraAuthority.governor()).to.equal(owner);
    });

    it('will revert if deployment is attempted with a zero address for THEO', async function () {
      await expect(
        deployments.deploy(CONTRACTS.staking, {
          from: owner,
          args: [
            addressZero,
            owner,
            epochLengthInBlocks,
            firstEpochNumber,
            firstEpochBlock,
            TheopetraAuthority.address,
          ],
        })
      ).to.be.revertedWith('Invalid address');
    });

    it('will revert if deployment is attempted with a zero address for sTHEO', async function () {
      await expect(
        deployments.deploy(CONTRACTS.staking, {
          from: owner,
          args: [
            owner,
            addressZero,
            epochLengthInBlocks,
            firstEpochNumber,
            firstEpochBlock,
            TheopetraAuthority.address,
          ],
        })
      ).to.be.revertedWith('Invalid address');
    });
  });

  describe('setContract', function () {
    it('should allw the manager to set a contract address for LP staking', async function () {
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
    it('adds a Claim for the staked _amount to the warmup when `_claim` is false and `warmupPeriod` is zero', async function () {
      const [, bob] = users;
      const claim = false;

      await bob.Staking.stake(bob.address, amountToStake, claim);

      const warmupInfo = await Staking.warmupInfo(bob.address);
      const epochInfo = await Staking.epoch();
      expect(warmupInfo.deposit).to.equal(amountToStake);
      expect(warmupInfo.expiry).to.equal(epochInfo.number); // equal because warmup is zero
      expect(warmupInfo.gons).to.equal(amountToStake); // sTheoMock.gonsForBalance() just returns amount
      expect(warmupInfo.lock).to.equal(false);
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

    it('adds a Claim in warmup, with the correct deposit and expiry, when `_claim` is true and the warmup period is greater than 0', async function () {
      const [, bob] = users;
      const claim = true;
      const warmupPeriod = 5;

      await Staking.setWarmup(warmupPeriod);
      expect(await Staking.warmupPeriod()).to.equal(5);

      await bob.Staking.stake(bob.address, amountToStake, claim);

      expect(await Staking.supplyInWarmup()).to.equal(amountToStake);

      const warmupInfo = await Staking.warmupInfo(bob.address);
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
