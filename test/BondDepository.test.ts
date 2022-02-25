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

    // it('should use the correct address for the theo token when deployed', async function () {
    //   const { BondDepository, owner } = await setup();

    //   expect(await BondDepository.theo()).to.equal(owner);
    // });
  });

  describe('Create market', function () {
    it.only('is access controlled to allow only the policy to create a market', async function () {
      const { BondDepository, owner, UsdcTokenMock } = await setup();
      const capacity = 10000e9;
      const initialPrice = 400e9;
      const buffer = 2e5;
      const capacityInQuote = true;
      const fixedTerm = true;
      const vesting = 100;
      const timeToConclusion = 60 * 60 * 24;
      const block = await ethers.provider.getBlock('latest');
      const conclusion = block.timestamp + timeToConclusion;
      const depositInterval = 60 * 60 * 4;
      const tuneInterval = 60 * 60;

      // TODO: Update quote token to mock token (e.g. USDC)
      await BondDepository.create(
        UsdcTokenMock.address,
        [capacity, initialPrice, buffer],
        [capacityInQuote, fixedTerm],
        [vesting, conclusion],
        [depositInterval, tuneInterval]
      );
    });
  });
});
