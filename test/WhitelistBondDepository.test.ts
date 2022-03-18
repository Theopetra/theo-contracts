import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';
import { WhitelistTheopetraBondDepository, WETH9, PriceConsumerV3MockETH } from '../typechain-types';
import { setupUsers } from './utils';
import { CONTRACTS, MOCKS, MOCKSWITHARGS } from '../utils/constants';

const setup = deployments.createFixture(async function () {
  await deployments.fixture([
    CONTRACTS.bondDepo,
    CONTRACTS.authority,
    MOCKS.sTheoMock,
    MOCKS.theoTokenMock,
    MOCKS.usdcTokenMock,
    MOCKSWITHARGS.stakingMock,
    MOCKSWITHARGS.treasuryMock,
    MOCKS.WETH9,
    MOCKSWITHARGS.priceConsumerV3MockETH,
  ]);

  const { deployer: owner } = await getNamedAccounts();

  const contracts = {
    TheopetraAuthority: await ethers.getContract(CONTRACTS.authority),
    WhitelistBondDepository: <WhitelistTheopetraBondDepository>await ethers.getContract(CONTRACTS.whitelistBondDepo),
    sTheoMock: await ethers.getContract(MOCKS.sTheoMock),
    StakingMock: await ethers.getContract(MOCKSWITHARGS.stakingMock),
    TheopetraERC20Mock: await ethers.getContract(MOCKS.theoTokenMock),
    TreasuryMock: await ethers.getContract(MOCKSWITHARGS.treasuryMock),
    UsdcTokenMock: await ethers.getContract(MOCKS.usdcTokenMock),
    WETH9: <WETH9>await ethers.getContract(MOCKS.WETH9),
    PriceConsumerV3MockETH: <PriceConsumerV3MockETH>await ethers.getContract(MOCKSWITHARGS.priceConsumerV3MockETH),
  };

  const users = await setupUsers(await getUnnamedAccounts(), contracts);

  return {
    ...contracts,
    users,
    owner,
  };
});

describe.only('Whitelist Bond depository', function () {
  const LARGE_APPROVAL = '100000000000000000000000000000000';
  const initialMint = '10000000000000000000000000';

  const capacity = 10000e9;
  const initialPrice = 400e9;
  const buffer = 2e5;
  const capacityInQuote = false;
  const fixedTerm = true;
  const vesting = 100;
  const timeToConclusion = 60 * 60 * 24;
  const depositInterval = 60 * 60 * 4;
  const tuneInterval = 60 * 60;

  let WhitelistBondDepository: any;
  let WETH9: WETH9;
  let PriceConsumerV3MockETH: any;
  let users: any;

  beforeEach(async function () {
    ({ WhitelistBondDepository, WETH9, PriceConsumerV3MockETH, users } = await setup());
    const [, , bob] = users;
    const block = await ethers.provider.getBlock('latest');
    const conclusion = block.timestamp + timeToConclusion;

    await bob.WETH9.deposit({ value: ethers.utils.parseEther('100') });

    await bob.WETH9.approve(WhitelistBondDepository.address, LARGE_APPROVAL);

    await WhitelistBondDepository.create(
      WETH9.address,
      PriceConsumerV3MockETH.address,
      [capacity, initialPrice, buffer],
      [capacityInQuote, fixedTerm],
      [vesting, conclusion],
      [depositInterval, tuneInterval]
    );
  });

  describe('Deployment', function () {
    it('can be deployed', async function () {
      await setup();
    });
  });

  describe('Create market', function () {
    it('can be created with the address of a price consumer', async function () {
      expect(await WhitelistBondDepository.isLive(0)).to.equal(true);
    });

    it('stores the price consumer address in the Market information', async function () {
      const [, , priceConsumerV3] = await WhitelistBondDepository.markets(0);
      expect(priceConsumerV3).to.equal(PriceConsumerV3MockETH.address);
    });

    describe('Deposit', function () {
      it('should allow a deposit', async function () {
        const [, , bob] = users;
        const marketId = 0;

        const depositAmount = ethers.utils.parseEther('100');
        await bob.WhitelistBondDepository.deposit(marketId, depositAmount, initialPrice, bob.address, bob.address);
        const bobNotesIndexes = await WhitelistBondDepository.indexesFor(bob.address);

        expect(bobNotesIndexes.length).to.equal(1);
      });

      it('emits the quote token price and decimals from the price consumer', async function () {
        const [, , bob] = users;
        const marketId = 0;
        const [mockPriceConsumerPrice, decimals] = await PriceConsumerV3MockETH.getLatestPrice();

        const depositAmount = ethers.utils.parseEther('100');

        await expect(
          bob.WhitelistBondDepository.deposit(marketId, depositAmount, initialPrice, bob.address, bob.address)
        ).to.emit(WhitelistBondDepository, 'Bond').withArgs(marketId, depositAmount, mockPriceConsumerPrice, decimals);
      });


    });
  });
});
