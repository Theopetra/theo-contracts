import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';
import { CONTRACTS } from '../utils/constants';
import { StakingDistributor__factory } from '../typechain-types';
import { setupUsers } from './utils';
import { getContracts } from '../utils/helpers';

const setup = deployments.createFixture(async () => {
  await deployments.fixture();
  const { deployer: owner } = await getNamedAccounts();
  const contracts = await getContracts();

  const users = await setupUsers(await getUnnamedAccounts(), contracts);

  return {
    ...contracts,
    users,
    owner,
  };
});

describe('Distributor', function () {
  const addressZero = ethers.utils.getAddress('0x0000000000000000000000000000000000000000');

  describe('Deployment', function () {
    it('can be deployed', async function () {
      await setup();
    });

    it('will revert if address zero is used as the Treasury address', async function () {
      const [owner] = await ethers.getSigners();
      const { TheopetraERC20Token, TheopetraAuthority, Staking } = await getContracts();
      const epochLength = 2000;
      const nextEpochBlock = 10;

      await expect(
        new StakingDistributor__factory(owner).deploy(
          addressZero,
          TheopetraERC20Token.address,
          epochLength,
          nextEpochBlock,
          TheopetraAuthority.address,
          Staking.address
        )
      ).to.be.revertedWith('Zero address: Treasury');
    });

    it('will revert if address zero is used as the theo token address', async function () {
      const [owner] = await ethers.getSigners();
      const { Treasury, TheopetraAuthority, Staking } = await getContracts();
      const epochLength = 2000;
      const nextEpochBlock = 10;

      await expect(
        new StakingDistributor__factory(owner).deploy(
          Treasury.address,
          addressZero,
          epochLength,
          nextEpochBlock,
          TheopetraAuthority.address,
          Staking.address
        )
      ).to.be.revertedWith('Zero address: THEO');
    });

    it('will revert if address zero is used as the Staking address', async function () {
      const [owner] = await ethers.getSigners();
      const { Treasury, TheopetraERC20Token, TheopetraAuthority } = await getContracts();
      const epochLength = 2000;
      const nextEpochBlock = 10;

      await expect(
        new StakingDistributor__factory(owner).deploy(
          Treasury.address,
          TheopetraERC20Token.address,
          epochLength,
          nextEpochBlock,
          TheopetraAuthority.address,
          addressZero
        )
      ).to.be.revertedWith('Zero address: Staking');
    });
  });

  describe('access control', function () {
    it('will revert if distribute is called from an account other than the staking contract', async function () {
      const { Distributor }: any = await setup();

      await expect(Distributor.distribute()).to.be.revertedWith('Only staking');
    });

    it('will revert if a call to retrieve bounty is made from an account other than the staking contract', async function () {
      const { Distributor }: any = await setup();

      await expect(Distributor.retrieveBounty()).to.be.revertedWith('Only staking');
    });

    it('will revert if a call to add recipient for distributions is made from an account other than the governor', async function () {
      const { users }: any = await setup();
      const [, alice] = users;

      await expect(alice.Distributor.addRecipient(alice.address, 5000)).to.be.revertedWith('UNAUTHORIZED');
    });

    it('will revert if a call to remove recipient for distributions is made from an account other than the governor or guardian', async function () {
      const { users } = await setup();
      const [, alice] = users;

      await expect(alice.Distributor.removeRecipient(0)).to.be.revertedWith('Caller is not governor or guardian');
    });

    it('will revert if a call to set adjustment info is made from an account other than the governor or guardian', async function () {
      const { users } = await setup();
      const [, alice] = users;

      await expect(alice.Distributor.setAdjustment(0, true, 5000, 2000)).to.be.revertedWith(
        'Caller is not governor or guardian'
      );
    });
  });

  describe('limiters', function () {
    it('will revert if a call is made to set bounty higher than 2e9', async function () {
      const { Distributor }: any = await setup();

      await expect(Distributor.setBounty(2000000001)).to.be.revertedWith('Too much');
    });

    it('limits the reward rate for a new recipient to be less than or equal to 100%', async function () {
      const { Distributor, users }: any = await setup();
      const [, alice] = users;

      // rateDenominator for Distributor is 1000000
      await expect(Distributor.addRecipient(alice.address, 1000001)).to.be.revertedWith(
        'Rate cannot exceed denominator'
      );
    });

    it('prevents the guardian from adjusting the reward rate of a collector by more than 2.5% at any given time', async function () {
      const { Distributor, TheopetraAuthority, users }: any = await setup();
      const [, alice, bob] = users;
      const initialRate = 2000;
      const adjustmentLimit = initialRate * 0.025;

      await TheopetraAuthority.pushGuardian(bob.address, true);

      await Distributor.addRecipient(alice.address, initialRate);
      await expect(bob.Distributor.setAdjustment(0, true, adjustmentLimit + 1, 2000)).to.be.revertedWith(
        'Limiter: cannot adjust by >2.5%'
      );
    });

    it('will revert if a call to reduce the reward rate for a collector is made using a value greater than the existing reward rate', async function () {
      const { Distributor, TheopetraAuthority, users }: any = await setup();
      const [, alice, bob] = users;
      const initialRate = 2000;

      await TheopetraAuthority.pushGuardian(bob.address, true);

      await Distributor.addRecipient(alice.address, initialRate);
      await expect(Distributor.setAdjustment(0, false, initialRate + 1, 2000)).to.be.revertedWith(
        'Cannot decrease rate by more than it already is'
      );
    });
  });
});
