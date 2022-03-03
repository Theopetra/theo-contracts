import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';

import { setupUsers } from './utils';
import { CONTRACTS } from '../utils/constants';

const setup = deployments.createFixture(async () => {
  await deployments.fixture([CONTRACTS.sTheo, CONTRACTS.authority]);
  const { deployer: owner } = await getNamedAccounts();

  const contracts = {
    sTheopetra: await ethers.getContract(CONTRACTS.sTheo),
    TheopetraAuthority: await ethers.getContract(CONTRACTS.authority),
  }

  const users = await setupUsers(await getUnnamedAccounts(), contracts);

  return {
    ...contracts,
    users,
    owner,
  };
});

describe('sTheopetra', function () {
  describe('Deployment', function () {
    it('can be deployed', async function () {
      await setup();
    });

    it('is constructed with the correct name, symbol and decimals', async function () {
      const { sTheopetra } = await setup();
      expect(await sTheopetra.name()).to.equal('Staked THEO');
      expect(await sTheopetra.symbol()).to.equal('sTHEO');
      expect(await sTheopetra.decimals()).to.equal(9);
    });

    it('sets the authority to be the TheopetraAuthority', async function () {
      const { sTheopetra, TheopetraAuthority, owner } = await setup();

      expect(await sTheopetra.authority()).to.equal(TheopetraAuthority.address);
    });
  });

  describe('Access control', async function () {
    it('allows the manager (currently set as the deployer) to set the index', async function () {
      // TODO: This test may be removed/updated in future (when modifying sTheo)
      // It is included here as an initial test of access control
      const { sTheopetra } = await setup();

      await sTheopetra.setIndex(10);
      expect(await sTheopetra.index()).to.equal(10);
    })

    it('reverts if a user other than the manager makes a call to set the index', async function () {
      // TODO: This test may be removed/updated in future (when modifying sTheo)
      // It is included here as an initial test of access control
      const { users } = await setup();
      const [, alice, ] = users;

      await expect(alice.sTheopetra.setIndex(10)).to.be.revertedWith('UNAUTHORIZED');
    })
  });
})