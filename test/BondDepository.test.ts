import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';
// import { BondDepository } from '../../next-app/src/typechain';
import { setupUsers } from './utils';
import { CONTRACTS, MOCKS } from '../utils/constants';

const setup = deployments.createFixture(async () => {
  await deployments.fixture([CONTRACTS.bondDepo]);
  await deployments.fixture([CONTRACTS.authority]);
  await deployments.fixture([MOCKS.theoTokenMock]);
  await deployments.fixture([MOCKS.usdcTokenMock]);

  const { deployer: owner } = await getNamedAccounts();
  const contracts = {
    TheopetraAuthority: await ethers.getContract(CONTRACTS.authority),
    BondDepository: await ethers.getContract(CONTRACTS.bondDepo),
    TheopetraERC20Mock: await ethers.getContract(MOCKS.theoTokenMock),
    UsdcTokenMock: await ethers.getContract(MOCKS.usdcTokenMock),
  };
  const users = await setupUsers(await getUnnamedAccounts(), contracts);
  return {
    ...contracts,
    users,
    owner,
    addressZero: '0x0000000000000000000000000000000000000000',
  };
});

describe('Bond depository', function () {
  describe('Deployment', function () {
    it('can be deployed', async function () {
      await setup();
    });
  });

  describe('Create market', function () {
    const capacity = 10000e9;
    const initialPrice = 400e9;
    const buffer = 2e5;
    const capacityInQuote = true;
    const fixedTerm = true;
    const vesting = 100;
    const timeToConclusion = 60 * 60 * 24;
    const depositInterval = 60 * 60 * 4;
    const tuneInterval = 60 * 60;

    it('allows the policy owner to create a market', async function () {
      const { BondDepository, UsdcTokenMock } = await setup();
      const block = await ethers.provider.getBlock('latest');
      const conclusion = block.timestamp + timeToConclusion;

      await BondDepository.create(
        UsdcTokenMock.address,
        [capacity, initialPrice, buffer],
        [capacityInQuote, fixedTerm],
        [vesting, conclusion],
        [depositInterval, tuneInterval]
      );
      expect(await BondDepository.isLive(0)).to.equal(true);
    });

    it('should revert if an address other than the policy owner makes a call to create a market', async function () {
      const { UsdcTokenMock, users } = await setup();
      const block = await ethers.provider.getBlock('latest');
      const conclusion = block.timestamp + timeToConclusion;

      const [, address2] = users;

      await expect(
        address2.BondDepository.create(
          UsdcTokenMock.address,
          [capacity, initialPrice, buffer],
          [capacityInQuote, fixedTerm],
          [vesting, conclusion],
          [depositInterval, tuneInterval]
        )
      ).to.be.revertedWith('UNAUTHORIZED');
    });
  });
});
