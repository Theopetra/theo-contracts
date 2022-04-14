import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';

import { setupUsers } from './utils';
import { CONTRACTS, MOCKSWITHARGS } from '../utils/constants';

const setup = deployments.createFixture(async () => {
  await deployments.fixture([CONTRACTS.pTheo, CONTRACTS.authority, MOCKSWITHARGS.stakingMock]);
  const { deployer: owner } = await getNamedAccounts();

  const contracts = {
    pTheopetra: await ethers.getContract(CONTRACTS.pTheo),
    TheopetraAuthority: await ethers.getContract(CONTRACTS.authority),
    Staking: await ethers.getContract(MOCKSWITHARGS.stakingMock),
  };

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
      const { pTheopetra } = await setup();
      expect(await pTheopetra.name()).to.equal('Platinum Staked THEO');
      expect(await pTheopetra.symbol()).to.equal('pTHEO');
      expect(await pTheopetra.decimals()).to.equal(9);
    });

    it('sets the authority to be the TheopetraAuthority', async function () {
      const { pTheopetra, TheopetraAuthority } = await setup();

      expect(await pTheopetra.authority()).to.equal(TheopetraAuthority.address);
    });
  });

  describe('initialize', function () {
    it('initializes with the staking contract', async function () {
      const { pTheopetra, Staking, addressZero } = await setup();

      expect(await pTheopetra.stakingContract()).to.equal(addressZero);

      await pTheopetra.initialize(Staking.address);
      expect(await pTheopetra.stakingContract()).to.equal(Staking.address);
    });
  });

  describe('Access control', function () {
    it('allows the manager (currently set as the deployer) to set the index', async function () {
      const { pTheopetra } = await setup();

      await pTheopetra.setIndex(10);
      expect(await pTheopetra.index()).to.equal(10);
    });

    it('reverts if a user other than the manager makes a call to set the index', async function () {
      const { users } = await setup();
      const [, alice] = users;

      await expect(alice.pTheopetra.setIndex(10)).to.be.revertedWith('UNAUTHORIZED');
    });

    it('reverts if a call to rebase is made from an account that is not the staking contract', async function () {
      const { pTheopetra } = await setup();

      await expect(pTheopetra.rebase(50, 5)).to.be.revertedWith('UNAUTHORIZED');
    });
  });
});
