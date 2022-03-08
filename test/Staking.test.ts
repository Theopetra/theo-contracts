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
  describe('Deployment', function () {
    const epochLengthInBlocks = 2000; // Same value as used in deployment script for Hardhat network deployment
    const firstEpochNumber = 1; // Same value as used in deployment script for Hardhat network deployment
    const firstEpochBlock = 10000; // Same value as used in deployment script for Hardhat network deployment

    it('can be deployed', async function () {
      await setup();
    });

    it('is deployed with the correct constructor arguments', async function () {
      const { Staking, sTheoMock, TheopetraAuthority, TheopetraERC20Mock, owner } = await setup();

      expect(await Staking.THEO()).to.equal(TheopetraERC20Mock.address); // Just using owner address for now, rather than a mock
      expect(await Staking.sTHEO()).to.equal(sTheoMock.address); // Just using owner address for now, rather than a mock

      const epoch = await Staking.epoch();

      expect(epoch._length).to.equal(BigNumber.from(epochLengthInBlocks));
      expect(epoch.number).to.equal(BigNumber.from(firstEpochNumber));
      expect(epoch.endBlock).to.equal(BigNumber.from(firstEpochBlock));

      expect(await TheopetraAuthority.governor()).to.equal(owner);
    });

    it('will revert if deployment is attempted with a zero address for THEO', async function () {
      const { addressZero, TheopetraAuthority, owner } = await setup();

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
      const { addressZero, TheopetraAuthority, owner } = await setup();

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
      const { Staking, users } = await setup();
      const [, alice] = users;
      await Staking.setContract(0, alice.address); // set distributor
      expect(await Staking.distributor()).to.equal(alice.address);
    });

    it('should revert if called by an address other than the manager', async function () {
      const { users } = await setup();
      const [, alice] = users;
      await expect(alice.Staking.setContract(0, alice.address)).to.be.revertedWith('UNAUTHORIZED');
    });
  });

  describe('Warmup', function () {
    it('should have a warmup period of zero when the contract is initialized', async function () {
      const { Staking } = await setup();

      expect(await Staking.warmupPeriod()).to.equal(0);
    })

    it('setWarmup, should allow the manager to set a warmup period for new stakers', async function () {
      const { Staking } = await setup();
      expect(await Staking.warmupPeriod()).to.equal(0);
      await Staking.setWarmup(5);
      expect(await Staking.warmupPeriod()).to.equal(5);
    });

    it('setWarmup, should revert if called by an address other than the manager', async function () {
      const { users } = await setup();
      const [, alice] = users;
      await expect(alice.Staking.setWarmup(1)).to.be.revertedWith('UNAUTHORIZED');
    });
  });

  describe('stake', function () {
    const amountToStake = 1000;
    const claim = false;
    const LARGE_APPROVAL = '100000000000000000000000000000000';

    let Staking: any;
    let sTheoMock: any;
    let TheopetraERC20Mock: any;
    let users: any;

    beforeEach(async function() {
      ({
        Staking,
        sTheoMock,
        TheopetraERC20Mock,
        users,
      } = await setup());

      const [,bob] = users; 

      await TheopetraERC20Mock.mint(bob.address, '10000000000000');
      await bob.TheopetraERC20Mock.approve(Staking.address, LARGE_APPROVAL);
    })

    it('adds a Claim for the staked _amount to the warmup when _claim is false and warmupPeriod is zero', async function () {
      const [,bob] = users;

      await bob.Staking.stake(amountToStake, bob.address, claim);

      const warmupInfo = await Staking.warmupInfo(bob.address);
      const epochInfo = await Staking.epoch();
      expect(warmupInfo.deposit).to.equal(amountToStake);
      expect(warmupInfo.expiry).to.equal(epochInfo.number); // equal because warmup is zero
      expect(warmupInfo.gons).to.equal(amountToStake); // sTheoMock.gonsForBalance() just returns amount
      expect(warmupInfo.lock).to.equal(false);
    });

    it.only('allows the staker to claim sTHEO immediately if _claim is true and warmup is zero', async function () {
      const [,bob] = users;
      const claim = true;

      // Mint enough to allow transfers when claiming staked THEO
      await sTheoMock.mint(Staking.address, '1000000000000000000000');
      await bob.Staking.stake(amountToStake, bob.address, claim);
      
    })
  });
});
