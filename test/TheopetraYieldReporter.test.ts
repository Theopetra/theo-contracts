import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';
import { setupUsers } from './utils';
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

  describe('reportYield', function () {
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
