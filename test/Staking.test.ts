import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';
import { TheopetraStaking__factory } from '../../next-app/src/typechain';
import { BigNumber } from 'ethers';

import { setupUsers } from './utils';
import { CONTRACTS, MOCKSWITHARGS } from '../utils/constants';

const setup = deployments.createFixture(async () => {
  await deployments.fixture([CONTRACTS.staking, CONTRACTS.authority]);
  const { deployer: owner } = await getNamedAccounts();

  const contracts = {
    Staking: await ethers.getContract(CONTRACTS.staking),
    TheopetraAuthority: await ethers.getContract(CONTRACTS.authority),
  };

  const users = await setupUsers(await getUnnamedAccounts(), contracts);

  return {
    ...contracts,
    users,
    owner,
    addressZero: ethers.utils.getAddress("0x0000000000000000000000000000000000000000"),
  };
});

describe('Staking', function () {
  describe('Deployment', function () {
    const epochLengthInBlocks = 2000; // Same value as used in deployment script for Hardhat network deployment
    const firstEpochNumber = 1; // Same value as used in deployment script for Hardhat network deployment
    const firstEpochBlock = 10; // Same value as used in deployment script for Hardhat network deployment
    
    it('can be deployed', async function () {
      await setup();
    });

    it('is deployed with the correct constructor arguments', async function() {
      const {Staking, TheopetraAuthority, owner} = await setup();

      expect(await Staking.THEO()).to.equal(owner); // Just using owner address for now, rather than a mock
      expect(await Staking.sTHEO()).to.equal(owner); // Just using owner address for now, rather than a mock

      const epoch = await Staking.epoch();

      expect(epoch._length).to.equal(BigNumber.from(epochLengthInBlocks));
      expect(epoch.number).to.equal(BigNumber.from(firstEpochNumber));
      expect(epoch.endBlock).to.equal(BigNumber.from(firstEpochBlock));

      expect(await TheopetraAuthority.governor()).to.equal(owner);
    });

    it('will revert if deployment is attempted with a zero address for THEO', async function() {
      const {addressZero, TheopetraAuthority, owner} = await setup();

      await expect(deployments.deploy(CONTRACTS.staking, {
        from: owner,
        args: [addressZero,
              owner,
              epochLengthInBlocks,
              firstEpochNumber,
              firstEpochBlock,
              TheopetraAuthority.address]
      })).to.be.revertedWith('Invalid address');
    });

    it('will revert if deployment is attempted with a zero address for sTHEO', async function() {
      const {addressZero, TheopetraAuthority, owner} = await setup();

      await expect(deployments.deploy(CONTRACTS.staking, {
        from: owner,
        args: [owner,
              addressZero,
              epochLengthInBlocks,
              firstEpochNumber,
              firstEpochBlock,
              TheopetraAuthority.address]
      })).to.be.revertedWith('Invalid address');
    })
  });


  describe('setContract', function () {
    it('should allw the manager to set a contract address for LP staking', async function () {
      const {Staking, users} = await setup();
      const [, alice] = users;
      await Staking.setContract(0, alice.address); // set distributor
      expect(await Staking.distributor()).to.equal(alice.address);
    })

    it('should revert if called by an address other than the manager', async function () {
      const {users} = await setup();
      const [, alice] = users;
      await expect(alice.Staking.setContract(0, alice.address)).to.be.revertedWith('UNAUTHORIZED');
    });
  });

  describe('setWarmup', function () {
    it('should allow the manager to set a warmup period for new stakers', async function () {
      const {Staking} = await setup();
      expect(await Staking.warmupPeriod()).to.equal(0);
      await Staking.setWarmup(5);
      expect(await Staking.warmupPeriod()).to.equal(5);
    });

    it('should revert if called by an address other than the manager', async function () {
      const {users} = await setup();
      const [, alice] = users;
      await expect(alice.Staking.setWarmup(1)).to.be.revertedWith('UNAUTHORIZED');
    });
  });
});