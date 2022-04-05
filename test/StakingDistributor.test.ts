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

describe.only('Distributor', function () {
  const addressZero = ethers.utils.getAddress('0x0000000000000000000000000000000000000000');
  const epochLength = 60 * 60 * 24 * 365; // seconds (for 365 days)
  const expectedStartRate = 40000; // 4%, rateDenominator for Distributor is 1000000
  const expectedDrs = 10_000_000; // 1%
  const expectedDys = 20_000_000; // 2%
  const isLocked = false;

  describe('Deployment', function () {
    it('can be deployed', async function () {
      await setup();
    });

    it('will revert if address zero is used as the Treasury address', async function () {
      const [owner] = await ethers.getSigners();
      const { TheopetraERC20Mock, TheopetraAuthority, StakingMock } = await getContracts();

      await expect(
        new StakingDistributor__factory(owner).deploy(
          addressZero,
          TheopetraERC20Mock.address,
          epochLength,
          TheopetraAuthority.address,
          StakingMock.address
        )
      ).to.be.revertedWith('Zero address: Treasury');
    });

    it('will revert if address zero is used as the theo token address', async function () {
      const [owner] = await ethers.getSigners();
      const { TreasuryMock, TheopetraAuthority, StakingMock } = await getContracts();

      await expect(
        new StakingDistributor__factory(owner).deploy(
          TreasuryMock.address,
          addressZero,
          epochLength,
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

      await expect(
        alice.Distributor.addRecipient(alice.address, expectedStartRate, expectedDrs, expectedDys, isLocked)
      ).to.be.revertedWith('UNAUTHORIZED');
    });

    it('will revert if a call to remove recipient for distributions is made from an account other than the governor or guardian', async function () {
      const { users } = await setup();
      const [, alice] = users;

      await expect(alice.Distributor.removeRecipient(0)).to.be.revertedWith('Caller is not governor or guardian');
    });

    it.skip('will revert if a call to set adjustment info is made from an account other than the governor or guardian', async function () {
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
      const { TreasuryMock } = await getContracts();
      deltaTokenPrice = await TreasuryMock.deltaTokenPrice();
      deltaTreasuryYield = await TreasuryMock.deltaTreasuryYield();
    });

    it('stores the correct information for the staking pool', async function () {
      const { Distributor, StakingMock }: any = await setup();

      await Distributor.addRecipient(StakingMock.address, expectedStartRate, expectedDrs, expectedDys, isLocked);

      const [startStored, scrs, scys, drs, dys, recipient, locked, nextEpochTime] = await Distributor.info(0);
      const expectedSCrs = (expectedDrs * deltaTokenPrice) / 10 ** 9;
      const expectedSCys = (expectedDys * deltaTreasuryYield) / 10 ** 9;
      const latestBlock = await ethers.provider.getBlock('latest');
      const expectedNextEpochTime = latestBlock.timestamp + epochLength;

      expect(startStored).to.equal(expectedStartRate);
      expect(Number(scrs)).to.equal(expectedSCrs);
      expect(Number(scys)).to.equal(expectedSCys);
      expect(Number(drs)).to.equal(expectedDrs);
      expect(Number(dys)).to.equal(expectedDys);
      expect(recipient).to.equal(StakingMock.address);
      expect(locked).to.equal(isLocked);
      expect(nextEpochTime).to.equal(expectedNextEpochTime);
    });
  });

  describe.only('distribute', function () {
    let Distributor: any;
    let staking: any;
    let owner: any;

    async function moveToNextEpoch() {
      const latestBlock = await ethers.provider.getBlock('latest');
      const newTimestampInSeconds = latestBlock.timestamp + epochLength * 1.001;
      await ethers.provider.send('evm_mine', [newTimestampInSeconds]); // move past the next epoch time
    }

    beforeEach(async function () {
      [owner, staking] = await ethers.getSigners();
      const { TreasuryMock, TheopetraERC20Mock, TheopetraAuthority } = await getContracts();

      Distributor = await new StakingDistributor__factory(owner).deploy(
        TreasuryMock.address,
        TheopetraERC20Mock.address,
        epochLength,
        TheopetraAuthority.address,
        staking.address
      );
    });

    it('can be called', async function () {
      await expect(Distributor.connect(staking).distribute()).to.not.be.reverted;
    });

    describe('unlocked pool', function () {
      beforeEach(async function () {
        // Add recipient: Unlocked pool
        await Distributor.addRecipient(staking.address, expectedStartRate, expectedDrs, expectedDys, isLocked);
      });
      it('will update the next epoch if the current time is beyond the next epoch time', async function () {
        const [, , , , , , , initialNextEpoch] = await Distributor.info(0);
        const latestBlock = await ethers.provider.getBlock('latest');

        // provide upper- and lower-bounds, as timestamps are a bit inaccurate with tests
        const lowerBound = latestBlock.timestamp * 0.999 + epochLength;
        const upperBound = latestBlock.timestamp * 1.001 + epochLength;
        expect(Number(initialNextEpoch)).to.be.greaterThan(lowerBound);
        expect(Number(initialNextEpoch)).to.be.lessThan(upperBound);

        const newTimestampInSeconds = latestBlock.timestamp + epochLength * 2;
        await ethers.provider.send('evm_mine', [newTimestampInSeconds]); // move past the next epoch time

        await Distributor.connect(staking).distribute();

        const [, , , , , , , newNextEpoch] = await Distributor.info(0);

        const newLowerBound = latestBlock.timestamp * 0.999 + epochLength * 2;
        const newUpperBound = latestBlock.timestamp * 1.001 + epochLength * 2;
        expect(Number(newNextEpoch)).to.be.greaterThan(newLowerBound);
        expect(Number(newNextEpoch)).to.be.lessThan(newUpperBound);
        expect(Number(newNextEpoch) - Number(initialNextEpoch)).to.equal(epochLength);
      });

      it('will reduce the starting rate of an unlocked pool by 0.5% if the current time is beyond the next epoch', async function () {
        const [initialStartRate] = await Distributor.info(0);
        expect(initialStartRate).to.equal(expectedStartRate);

        await moveToNextEpoch();

        await Distributor.connect(staking).distribute();

        const [newStartRate] = await Distributor.info(0);
        expect(newStartRate).to.equal(expectedStartRate - 5000); // rate denominator is 1_000_000
      });

      it('will repeatedly reduce the starting rate of an unlocked pool by 0.5% if the current time is beyond the next epoch', async function () {
        await moveToNextEpoch();
        const expectedRateReduction = 5000;

        await Distributor.connect(staking).distribute();
        const [newStartRate1] = await Distributor.info(0);
        expect(newStartRate1).to.equal(expectedStartRate - expectedRateReduction);

        await moveToNextEpoch();
        await Distributor.connect(staking).distribute();
        const [newStartRate2] = await Distributor.info(0);
        expect(newStartRate2).to.equal(expectedStartRate - expectedRateReduction * 2);

        await moveToNextEpoch();
        await Distributor.connect(staking).distribute();
        const [newStartRate3] = await Distributor.info(0);
        expect(newStartRate3).to.equal(expectedStartRate - expectedRateReduction * 3);
        expect(newStartRate3).to.equal(25000); // 2.5%, based on starting at 4% and 0.5% reduction per epoch (per year)
      });

      it('will not reduce the starting rate of a unlocked pool lower than 2%', async function () {
        for (let i = 0; i < 6; i++) {
          await moveToNextEpoch();
          await Distributor.connect(staking).distribute();
        }
        const [newStartRate] = await Distributor.info(0);
        expect(newStartRate).to.equal(20000);
      });
    });

    describe('locked pool', function () {
      const expectedStartRateLocked = 120000; // 12%, rateDenominator for Distributor is 1000000
      const expectedRateReduction = 15000;
      beforeEach(async function () {
        // Add new recipient: a locked pool
        await Distributor.addRecipient(staking.address, expectedStartRateLocked, expectedDrs, expectedDys, true);
      });
      it('will reduce the starting rate of a locked pool by 1.5% if the current time is beyond the next epoch', async function () {

        const [initialStartRate] = await Distributor.info(0);
        expect(initialStartRate).to.equal(expectedStartRateLocked);

        await moveToNextEpoch();

        await Distributor.connect(staking).distribute();

        const [newStartRate] = await Distributor.info(0);
        expect(newStartRate).to.equal(expectedStartRateLocked - expectedRateReduction);
      });

      it('will repeatedly reduce the starting rate of a locked pool by 1.5% if the current time is beyond the next epoch', async function () {
        await moveToNextEpoch();
        const expectedRateReduction = 15000;

        await Distributor.connect(staking).distribute();
        const [newStartRate1] = await Distributor.info(0);
        expect(newStartRate1).to.equal(expectedStartRateLocked - expectedRateReduction);

        await moveToNextEpoch();
        await Distributor.connect(staking).distribute();
        const [newStartRate2] = await Distributor.info(0);
        expect(newStartRate2).to.equal(expectedStartRateLocked - expectedRateReduction * 2);

        await moveToNextEpoch();
        await Distributor.connect(staking).distribute();
        const [newStartRate3] = await Distributor.info(0);
        expect(newStartRate3).to.equal(expectedStartRateLocked - expectedRateReduction * 3);
        expect(newStartRate3).to.equal(75000); // 2.5%, based on starting at 4% and 0.5% reduction per epoch (per year)
      });

      it('will not reduce the starting rate of a locked pool lower than 6%', async function () {
        for (let i = 0; i < 6; i++) {
          await moveToNextEpoch();
          await Distributor.connect(staking).distribute();
        }
        const [newStartRate] = await Distributor.info(0);
        expect(newStartRate).to.equal(60000);
      });
    });

  });

  describe.only('Discount Rates (Drs, Dys)', function (){
    let Distributor: any;
    let StakingMock: any;
    let users: any;
    beforeEach(async function () {
      ({ Distributor, StakingMock, users } = await setup() as any);
      await Distributor.addRecipient(StakingMock.address, expectedStartRate, expectedDrs, expectedDys, isLocked);
    })

    it('can update the Discount Rate Return Staking (Drs)', async function(){
      const [, , , drs, ] = await Distributor.info(0);
      expect(Number(drs)).to.equal(expectedDrs);

      const newExpectedDrs = 5_000_000; // 0.5%
      await Distributor.setDiscountRateStaking(0, newExpectedDrs);
      const [, , , newDrs, ] = await Distributor.info(0);
      expect(Number(newDrs)).to.equal(newExpectedDrs);
    });

    it('will revert if a call is made to update the Discount Rate Return Staking (Drs) from an account that is not the policy holder', async function(){
      const [,alice] = users;

      const [, , , drs, ] = await Distributor.info(0);
      expect(Number(drs)).to.equal(expectedDrs);

      await expect(alice.Distributor.setDiscountRateStaking(0, 5000000)).to.be.revertedWith('UNAUTHORIZED');
      const [, , , newDrs, ] = await Distributor.info(0);
      expect(Number(newDrs)).to.equal(expectedDrs);
    });

    it('can update the Discount Rate Return Yield (Dys)', async function(){
      const [, , , , dys,] = await Distributor.info(0);
      expect(Number(dys)).to.equal(expectedDys);

      const newExpectedDys = 40_000_000; // 4%
      await Distributor.setDiscountRateYield(0, newExpectedDys);
      const [, , , , newDys,] = await Distributor.info(0);
      expect(Number(newDys)).to.equal(newExpectedDys);
    });
  })

  describe.only('nextRewardRate', function () {
    let Distributor: any;
    let StakingMock: any;
    let users: any;
    beforeEach(async function () {
      ({ Distributor, StakingMock, users } = await setup() as any);
      await Distributor.addRecipient(StakingMock.address, expectedStartRate, expectedDrs, expectedDys, isLocked);
    })
    it('calculates an APY, variable', async function (){
      // Using values to match deltaTokenPrice and deltaTreasuryYield in TreasuryMock
      const expectedAPY = expectedStartRate + ((expectedDrs * 100_000_000) / 10**9) + ((expectedDys * 200_000_000) / 10**9)
      expect(await Distributor.nextRewardRate(0)).to.equal(expectedAPY);
    })
  });
});
