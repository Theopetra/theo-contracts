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
  await deployments.fixture([MOCKS.treasuryMock]);

  const { deployer: owner } = await getNamedAccounts();
  const contracts = {
    TheopetraAuthority: await ethers.getContract(CONTRACTS.authority),
    BondDepository: await ethers.getContract(CONTRACTS.bondDepo),
    TheopetraERC20Mock: await ethers.getContract(MOCKS.theoTokenMock),
    UsdcTokenMock: await ethers.getContract(MOCKS.usdcTokenMock),
    TreasuryMock: await ethers.getContract(MOCKS.treasuryMock),
  };
  const users = await setupUsers(await getUnnamedAccounts(), contracts);
  return {
    ...contracts,
    users,
    owner,
  };
});

describe('Bond depository', function () {
  const capacity = 10000e9;
  const initialPrice = 400e9;
  const buffer = 2e5;
  const capacityInQuote = true;
  const fixedTerm = true;
  const vesting = 100;
  const timeToConclusion = 60 * 60 * 24;
  const depositInterval = 60 * 60 * 4;
  const tuneInterval = 60 * 60;

  describe('Deployment', function () {
    it('can be deployed', async function () {
      await setup();
    });
  });

  describe('Create market', function () {
    let block;
    let conclusion: number;
    beforeEach(async function () {
      block = await ethers.provider.getBlock('latest');
      conclusion = block.timestamp + timeToConclusion;
    });
    
    it('allows the policy owner to create a market', async function () {
      const { BondDepository, UsdcTokenMock } = await setup();

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
      const [, alice] = users;

      await expect(
        alice.BondDepository.create(
          UsdcTokenMock.address,
          [capacity, initialPrice, buffer],
          [capacityInQuote, fixedTerm],
          [vesting, conclusion],
          [depositInterval, tuneInterval]
        )
      ).to.be.revertedWith('UNAUTHORIZED');
    });
  });

  describe('Deposit', function () {
    const LARGE_APPROVAL = '100000000000000000000000000000000';
    // Initial mint for Mock USDC
    const initialMint = '10000000000000000000000000';

    let BondDepository: any;
    let UsdcTokenMock: any;
    let users: any;
    before(async function () {
      ({ BondDepository, UsdcTokenMock, users } =
        await setup());
    });

    beforeEach(async function () {
      const [, , bob, ] = users;

      await UsdcTokenMock.mint(bob.address, initialMint);

      await bob.UsdcTokenMock.approve(BondDepository.address, LARGE_APPROVAL);

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

    it('should allow a deposit', async () => {
      const [, , bob, carol] = users;
      const amount = '10000';

      await bob.BondDepository.deposit(0, amount, initialPrice, bob.address, carol.address);
      expect(Array(await BondDepository.indexesFor(bob.address)).length).to.equal(1);
    });

    it("should not allow a deposit greater than max payout", async () => {
      const [, , bob, carol] = users;
      const amount = "6700000000000000000000000";
      await expect(
          bob.BondDepository.deposit(0, amount, initialPrice, bob.address, carol.address)
      ).to.be.revertedWith("Depository: max size exceeded");
  });
  });

  describe('Close market', function () {
    
  })
});
