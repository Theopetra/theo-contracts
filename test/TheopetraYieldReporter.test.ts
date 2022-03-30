import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';
import { setupUsers, waitFor } from './utils';
import { CONTRACTS } from '../utils/constants';

const setup = deployments.createFixture(async function () {
  await deployments.fixture([
    CONTRACTS.yieldReporter,
  ]);

  const { deployer: owner } = await getNamedAccounts();

  const contracts = {
    TheopetraYieldReporter: await ethers.getContract(CONTRACTS.yieldReporter),
  }

  const users = await setupUsers(await getUnnamedAccounts(), contracts);

  return {
    ...contracts,
    users,
    owner,
  };
});

describe('Theopetra Yield Reporter', function () {
  let TheopetraYieldReporter: any;

  let owner: any;

  beforeEach(async function () {
    ({
      TheopetraYieldReporter,
      owner,
    } = await setup());
  });

  describe('Deployment', function () {
    it('can be deployed', async function () {
      expect(TheopetraYieldReporter).to.not.be.undefined;
    });
  });

  describe('decimals', function () {
    it('returns 9', async function () {
      const decimals = await TheopetraYieldReporter.decimals();
      expect(decimals).to.equal(9);
    });
  });

  describe('lastYield', function () {
    it('returns 0 when there has been no yields reported', async function () {
      const lastYield = await TheopetraYieldReporter.lastYield();
      expect(lastYield).to.equal(0);
    });

    it('returns 0 when only 1 yield has been reported', async function () {
      await waitFor(TheopetraYieldReporter.reportYield(50_000_000_000));
      const lastYield = await TheopetraYieldReporter.lastYield();
      expect(lastYield).to.equal(0);
    });

    it('returns the previous value when more than 1 yield has been reported', async function () {
      const amount = 150_000_000_000;
      await waitFor(TheopetraYieldReporter.reportYield(50_000_000_000));
      await waitFor(TheopetraYieldReporter.reportYield(amount));
      await waitFor(TheopetraYieldReporter.reportYield(50_000_000_000));
      const lastYield = await TheopetraYieldReporter.lastYield();
      expect(lastYield).to.equal(amount);
    });
  });

  describe('currentYield', function () {
    it('returns 0 when there has been no yields reported', async function () {
      const currentYield = await TheopetraYieldReporter.currentYield();
      expect(currentYield).to.equal(0);
    });

    it('returns the current value when 1 or more yields has been reported', async function () {
      const amount = 150_000_000_000;
      await waitFor(TheopetraYieldReporter.reportYield(50_000_000_000));
      await waitFor(TheopetraYieldReporter.reportYield(50_000_000_000));
      await waitFor(TheopetraYieldReporter.reportYield(amount));
      const currentYield = await TheopetraYieldReporter.currentYield();
      expect(currentYield).to.equal(amount);
    });
  });

  describe('getYieldById', function () {
    it('should revert when requested ID greater than current ID', async function () {
      await waitFor(TheopetraYieldReporter.reportYield(50_000_000_000));
      await expect(TheopetraYieldReporter.getYieldById(2))
        .to.be.revertedWith('OUT_OF_BOUNDS');
    });

    it('should return 0 for ID 0', async function () {
      const yield0 = await TheopetraYieldReporter.getYieldById(0);
      expect(yield0).to.equal(0);
    });

    it('returns the yield value of the requested ID', async function () {
      const amounts = [
        0,
        50_000_000_000,
        100_000_000_000,
        150_000_000_000,
      ];

      await waitFor(TheopetraYieldReporter.reportYield(amounts[1]));
      await waitFor(TheopetraYieldReporter.reportYield(amounts[2]));
      await waitFor(TheopetraYieldReporter.reportYield(amounts[3]));

      const yield1 = await TheopetraYieldReporter.getYieldById(1);
      const yield2 = await TheopetraYieldReporter.getYieldById(2);
      const yield3 = await TheopetraYieldReporter.getYieldById(3);

      expect(yield1).to.equal(amounts[1]);
      expect(yield2).to.equal(amounts[2]);
      expect(yield3).to.equal(amounts[3]);
    });
  });

  describe('reportYield', function () {
    it('should store _amount as the latest yield and update the currentIndex', async function () {
      const amount = 150_000_000_000;
      await waitFor(TheopetraYieldReporter.reportYield(amount));

      const currentIndex = await TheopetraYieldReporter.getCurrentIndex();
      const currentYield = await TheopetraYieldReporter.currentYield();
      expect(currentIndex).to.equal(1);
      expect(currentYield).to.equal(amount);
    });

    it('should return the currentIndex', async function () {
      const currentIndex = await TheopetraYieldReporter.callStatic.reportYield(50_000_000_000);

      expect(Number( currentIndex)).to.equal(1);
    });

    it('should emit a ReportYield event with the new ID and amount', async function () {
      const amount = 150_000_000_000;
      const { events } = await waitFor(TheopetraYieldReporter.reportYield(amount));

      expect(events).to.have.length(1);
      expect(events[0].event).to.equal('ReportYield');
      expect(events[0].args.id).to.equal(1);
      expect(events[0].args.yield).to.equal(amount);
    });

    it('should revert if called by an address other than the policy owner', async function () {
      const { users } = await setup();
      const [, alice] = users;

      await expect(
        alice.TheopetraYieldReporter.reportYield(
          1,
        )
      ).to.be.revertedWith('UNAUTHORIZED');
    })
  });
});
