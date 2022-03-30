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
