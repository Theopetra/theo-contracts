import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';

import { setupUsers } from './utils';
import { CONTRACTS, MOCKSWITHARGS } from '../utils/constants';

const setup = deployments.createFixture(async () => {
  await deployments.fixture([CONTRACTS.sTheo, CONTRACTS.authority, MOCKSWITHARGS.stakingMock, MOCKSWITHARGS.treasuryMock]);
  const { deployer: owner } = await getNamedAccounts();

  const contracts = {
    sTheopetra: await ethers.getContract(CONTRACTS.sTheo),
    TheopetraAuthority: await ethers.getContract(CONTRACTS.authority),
    StakingMock: await ethers.getContract(MOCKSWITHARGS.stakingMock),
    TreasuryMock: await ethers.getContract(MOCKSWITHARGS.treasuryMock)
  };

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
      const { sTheopetra } = await setup();
      expect(await sTheopetra.name()).to.equal('Staked THEO');
      expect(await sTheopetra.symbol()).to.equal('sTHEO');
      expect(await sTheopetra.decimals()).to.equal(9);
    });

    it('sets the authority to be the TheopetraAuthority', async function () {
      const { sTheopetra, TheopetraAuthority } = await setup();

      expect(await sTheopetra.authority()).to.equal(TheopetraAuthority.address);
    });
  });

  describe('initialize', function () {
    it('initializes with the staking contract and treasury contract', async function () {
      const { sTheopetra, StakingMock, TreasuryMock, addressZero } = await setup();

      expect(await sTheopetra.stakingContract()).to.equal(addressZero);
      expect(await sTheopetra.treasury()).to.equal(addressZero);

      await sTheopetra.initialize(StakingMock.address, TreasuryMock.address);
      expect(await sTheopetra.stakingContract()).to.equal(StakingMock.address);
      expect(await sTheopetra.treasury()).to.equal(TreasuryMock.address);
    });
  });

  describe('Access control', function () {
    it('allows the manager (currently set as the deployer) to set the index', async function () {
      // This test may be removed/updated in future (when modifying sTheo)
      // It is included here as an initial test of inclusion of TheopetraAccessControlled
      const { sTheopetra } = await setup();

      await sTheopetra.setIndex(10);
      expect(await sTheopetra.index()).to.equal(10);
    });

    it('reverts if a user other than the manager makes a call to set the index', async function () {
      // This test may be removed/updated in future (when modifying sTheo)
      // It is included here as an initial test of inclusion of TheopetraAccessControlled
      const { users } = await setup();
      const [, alice] = users;

      await expect(alice.sTheopetra.setIndex(10)).to.be.revertedWith('UNAUTHORIZED');
    });

    it('reverts if a call to rebase is made from an account that is not the staking contract', async function () {
      const { sTheopetra } = await setup();

      await expect(sTheopetra.rebase(50, 5)).to.be.revertedWith('UNAUTHORIZED');
    });
  });
});
