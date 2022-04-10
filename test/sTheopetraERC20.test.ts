import { expect } from './chai-setup';
import { deployments, getNamedAccounts, getUnnamedAccounts } from 'hardhat';

import { setupUsers } from './utils';
import { CONTRACTS, TESTWITHMOCKS } from '../utils/constants';
import { getContracts } from '../utils/helpers';

const setup = deployments.createFixture(async () => {
  await deployments.fixture();
  const { deployer: owner } = await getNamedAccounts();

  const contracts = await getContracts(CONTRACTS.sTheo);

  const users = await setupUsers(await getUnnamedAccounts(), contracts);

  return {
    ...contracts,
    users,
    owner,
    addressZero: '0x0000000000000000000000000000000000000000',
  };
});

describe('sTheopetra', function () {
  describe('Deployment', function () {
    it('can be deployed', async function () {
      await setup();
    });

    it('is constructed with the correct name, symbol and decimals', async function () {
      const { sTheo } = await setup();
      expect(await sTheo.name()).to.equal('Staked THEO');
      expect(await sTheo.symbol()).to.equal('sTHEO');
      expect(await sTheo.decimals()).to.equal(9);
    });

    it('sets the authority to be the TheopetraAuthority', async function () {
      const { sTheo, TheopetraAuthority } = await setup();

      expect(await sTheo.authority()).to.equal(TheopetraAuthority.address);
    });
  });

  describe('initialize', function () {
    it('initializes with the staking contract and treasury contract', async function () {
      const { sTheo, Staking, Treasury, addressZero } = await setup();

      // sTHEO has already been initialized during setup for tests without mocks
      if (process.env.NODE_ENV === TESTWITHMOCKS) {
        expect(await sTheo.stakingContract()).to.equal(addressZero);
        expect(await sTheo.treasury()).to.equal(addressZero);
        await sTheo.initialize(Staking.address, Treasury.address);
      }

      expect(await sTheo.stakingContract()).to.equal(Staking.address);
      expect(await sTheo.treasury()).to.equal(Treasury.address);
    });
  });

  describe('Access control', function () {
    it('allows the manager (currently set as the deployer) to set the index', async function () {
      // This test may be removed/updated in future (when modifying sTheo)
      // It is included here as an initial test of inclusion of TheopetraAccessControlled
      const { sTheo } = await setup();

      await sTheo.setIndex(10);
      expect(await sTheo.index()).to.equal(10);
    });

    it('reverts if a user other than the manager makes a call to set the index', async function () {
      // This test may be removed/updated in future (when modifying sTheo)
      // It is included here as an initial test of inclusion of TheopetraAccessControlled
      const { users } = await setup();
      const [, alice] = users;

      await expect(alice.sTheo.setIndex(10)).to.be.revertedWith('UNAUTHORIZED');
    });

    it('reverts if a call to rebase is made from an account that is not the staking contract', async function () {
      const { sTheo } = await setup();

      await expect(sTheo.rebase(50, 5)).to.be.revertedWith('UNAUTHORIZED');
    });
  });
});
