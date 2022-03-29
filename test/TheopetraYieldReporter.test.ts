import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts } from 'hardhat';
import { CONTRACTS } from '../utils/constants';

const setup = deployments.createFixture(async function () {
  await deployments.fixture([
    CONTRACTS.yieldReporter,
  ]);

  const { deployer: owner } = await getNamedAccounts();

  const contracts = {
    TheopetraYieldReporter: await ethers.getContract(CONTRACTS.yieldReporter),
  }

  return {
    ...contracts,
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
});
