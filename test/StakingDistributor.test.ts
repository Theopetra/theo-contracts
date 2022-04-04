import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';

import {
  StakingDistributor__factory,
  StakingDistributor,
  STheoMock,
  TheopetraAuthority,
  TreasuryMock,
  TheopetraERC20Mock,
} from '../typechain-types';

import { setupUsers } from './utils';
import { CONTRACTS, MOCKS, MOCKSWITHARGS } from '../utils/constants';
import { Contract } from 'ethers';

interface TheoContracts {
  [key: string]: Contract;
}

const getContracts = async (): Promise<TheoContracts> => {
  await deployments.fixture([
    CONTRACTS.distributor,
    CONTRACTS.authority,
    MOCKSWITHARGS.treasuryMock,
    MOCKSWITHARGS.stakingMock,
  ]);

  return {
    Distributor: <StakingDistributor>await ethers.getContract(CONTRACTS.distributor),
    StakingMock: <STheoMock>await ethers.getContract(MOCKSWITHARGS.stakingMock),
    TheopetraAuthority: <TheopetraAuthority>await ethers.getContract(CONTRACTS.authority),
    TreasuryMock: <TreasuryMock>await ethers.getContract(MOCKSWITHARGS.treasuryMock),
    TheopetraERC20Mock: <TheopetraERC20Mock>await ethers.getContract(MOCKS.theoTokenMock),
  };
};

const setup = deployments.createFixture(async () => {
  await deployments.fixture([CONTRACTS.distributor, MOCKSWITHARGS.stakingMock]);
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
      const { TheopetraERC20Mock, TheopetraAuthority, StakingMock } = await getContracts();
      const epochLength = 2000;
      const nextEpochBlock = 10;

      await expect(
        new StakingDistributor__factory(owner).deploy(
          addressZero,
          TheopetraERC20Mock.address,
          epochLength,
          nextEpochBlock,
          TheopetraAuthority.address,
          StakingMock.address
        )
      ).to.be.revertedWith('Zero address: Treasury');
    });

    it('will revert if address zero is used as the theo token address', async function () {
      const [owner] = await ethers.getSigners();
      const { TreasuryMock, TheopetraAuthority, StakingMock } = await getContracts();
      const epochLength = 2000;
      const nextEpochBlock = 10;

      await expect(
        new StakingDistributor__factory(owner).deploy(
          TreasuryMock.address,
          addressZero,
          epochLength,
          nextEpochBlock,
          TheopetraAuthority.address,
          StakingMock.address
        )
      ).to.be.revertedWith('Zero address: THEO');
    });

    it('will revert if address zero is used as the Staking address', async function () {
      const [owner] = await ethers.getSigners();
      const { TreasuryMock, TheopetraERC20Mock, TheopetraAuthority } = await getContracts();
      const epochLength = 2000;
      const nextEpochBlock = 10;

      await expect(
        new StakingDistributor__factory(owner).deploy(
          TreasuryMock.address,
          TheopetraERC20Mock.address,
          epochLength,
          nextEpochBlock,
          TheopetraAuthority.address,
          addressZero
        )
      ).to.be.revertedWith('Zero address: Staking');
    });
  });

  describe.skip('access control', function () {
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

  describe.skip('limiters', function () {
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

  describe('Add recipient', function () {
    let deltaTokenPrice: number;
    let deltaTreasuryYield: number;

    beforeEach(async function () {
      const {TreasuryMock} = await getContracts();
      deltaTokenPrice = await TreasuryMock.deltaTokenPrice();
      deltaTreasuryYield= await TreasuryMock.deltaTreasuryYield();
    })

    it('stores information on start rate, SCrs, SCys, Drs, Dys and whether the staking pool is locked', async function () {
      const { Distributor, StakingMock }: any = await setup();

      const expectedStartRate = 5000; // rateDenominator for Distributor is 1000000
      const expectedDrs = 10_000_000 // 1%
      const expectedDys = 20_000_000 // 2%
      const isLocked = false;
      await Distributor.addRecipient(StakingMock.address, expectedStartRate, expectedDrs, expectedDys, isLocked);

      const [startStored, scrs, scys, drs, dys, recipient, locked] = await Distributor.info(0);
      const expectedSCrs = (expectedDrs * deltaTokenPrice) / 10**9;
      const expectedSCys = (expectedDys * deltaTreasuryYield) / 10**9;

      expect(startStored).to.equal(expectedStartRate);
      expect(Number(scrs)).to.equal(expectedSCrs);
      expect(Number(scys)).to.equal(expectedSCys);
      expect(Number(drs)).to.equal(expectedDrs);
      expect(Number(dys)).to.equal(expectedDys);
      expect(recipient).to.equal(StakingMock.address);
      expect(locked).to.equal(isLocked);
    });


  })

  describe.skip('reward schedule', function () {
    it('can add a starting rate when adding a recipient', async function () {
      const { Distributor, StakingMock }: any = await setup();
      const startingRate = 2000;

      await expect(Distributor.addRecipient(StakingMock.address, startingRate)).to.not.be.reverted;
    });


    it('stores the starting rate', async function () {
      const { Distributor, StakingMock }: any = await setup();
      const startingRate = 2000;

      await Distributor.addRecipient(StakingMock.address, startingRate);
      const [, start,] = await Distributor.info(0);
      expect(start).to.equal(startingRate);
    })
  })
});
