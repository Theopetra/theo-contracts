import { expect } from './chai-setup';
import { deployments, getNamedAccounts, getUnnamedAccounts } from 'hardhat';

import { setupUsers } from './utils';
import { CONTRACTS, TESTWITHMOCKS } from '../utils/constants';
import { getContracts } from '../utils/helpers';

const setup = deployments.createFixture(async () => {
  await deployments.fixture();
  const { deployer: owner } = await getNamedAccounts();

  const contracts = await getContracts(CONTRACTS.pTheo);

  const users = await setupUsers(await getUnnamedAccounts(), contracts);

  return {
    ...contracts,
    users,
    owner,
    addressZero: '0x0000000000000000000000000000000000000000',
  };
});

describe('pTheopetra', function () {
  describe('Deployment', function () {
    it('can be deployed', async function () {
      await setup();
    });

    it('is constructed with the correct name, symbol and decimals', async function () {
      const { pTheo } = await setup();
      expect(await pTheo.name()).to.equal('Platinum Staked Theo');
      expect(await pTheo.symbol()).to.equal('pTHEO');
      expect(await pTheo.decimals()).to.equal(9);
    });

    it('sets the authority to be the TheopetraAuthority', async function () {
      const { pTheo, TheopetraAuthority } = await setup();

      expect(await pTheo.authority()).to.equal(TheopetraAuthority.address);
    });
  });

  describe('initialize', function () {
    it('initializes with the locked tranche staking contract', async function () {
      const { pTheo, StakingLocked, addressZero } = await setup();

      // pTHEO has already been initialized during setup for tests without mocks
      if (process.env.NODE_ENV === TESTWITHMOCKS) {
        expect(await pTheo.stakingContract()).to.equal(addressZero);
        await pTheo.initialize(StakingLocked.address);
      }
      expect(await pTheo.stakingContract()).to.equal(StakingLocked.address);
    });
  });

  describe('Access control', function () {
    it('allows the guardian (currently set as the deployer) to set the index', async function () {
      const { pTheo } = await setup();

      await pTheo.setIndex(10);
      expect(await pTheo.index()).to.equal(10);
    });

    it('reverts if a user other than the guardian makes a call to set the index', async function () {
      const { users } = await setup();
      const [, alice] = users;

      await expect(alice.pTheo.setIndex(10)).to.be.revertedWith('UNAUTHORIZED');
    });

    it('reverts if a call to rebase is made from an account that is not the staking contract', async function () {
      const { pTheo } = await setup();

      await expect(pTheo.rebase(50, 5)).to.be.revertedWith('UNAUTHORIZED');
    });
  });
});
