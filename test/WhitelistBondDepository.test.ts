import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';
import { WhitelistTheopetraBondDepository, WETH9, PriceConsumerV3Mock } from '../typechain-types';
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
    MOCKS.priceConsumerV3Mock,
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
    PriceConsumerV3Mock: <PriceConsumerV3Mock>await ethers.getContract(MOCKS.priceConsumerV3Mock),
  };

  const users = await setupUsers(await getUnnamedAccounts(), contracts);

  return {
    ...contracts,
    users,
    owner,
  };
});

describe('Whitelist Bond depository', function () {
  const LARGE_APPROVAL = '100000000000000000000000000000000';
  const initialMint = '10000000000000000000000000';
  const rinkebyEthUsdPriceFeed = '0x8A753747A1Fa494EC906cE90E9f37563A8AF630e';

  // Market-specific
  const capacity = 1e14;
  const initialPrice = 10e9; // 10 USD per THEO (9 decimals)
  const buffer = 2e5;
  const capacityInQuote = false;
  const fixedTerm = true;
  const vesting = 100;
  const timeToConclusion = 60 * 60 * 24;
  const depositInterval = 60 * 60 * 4;
  const tuneInterval = 60 * 60;
  const marketId = 0;

  // Deposit-specific
  const depositAmount = ethers.utils.parseEther('25');
  const maxPrice = ethers.utils.parseEther('25');

  let WhitelistBondDepository: any;
  let WETH9: WETH9;
  let PriceConsumerV3Mock: any;
  let users: any;
  let owner: any;

  let expectedPrice: number;
  let expectedPayout: number;

  beforeEach(async function () {
    ({ WhitelistBondDepository, WETH9, PriceConsumerV3Mock, users, owner } = await setup());
    const [, , bob] = users;
    const block = await ethers.provider.getBlock('latest');
    const conclusion = block.timestamp + timeToConclusion;

    await bob.WETH9.deposit({ value: ethers.utils.parseEther('100') });

    await bob.WETH9.approve(WhitelistBondDepository.address, LARGE_APPROVAL);

    await WhitelistBondDepository.create(
      WETH9.address,
      rinkebyEthUsdPriceFeed,
      [capacity, initialPrice, buffer],
      [capacityInQuote, fixedTerm],
      [vesting, conclusion],
      [depositInterval, tuneInterval]
    );

     // Calculate the `expectedPrice` of THEO per ETH using mock price consumer values
    const [mockPriceConsumerPrice, mockPriceConsumerDecimals] = await PriceConsumerV3Mock.getLatestPrice(
      rinkebyEthUsdPriceFeed
    );
    const expectedScaledPrice = initialPrice * 10 ** (mockPriceConsumerDecimals + 9 - 9); // mockPriceConsumerDecimals + THEO decimals (9) - usdPerTHEO decimals (0)
    expectedPrice = Math.floor(Number(expectedScaledPrice / mockPriceConsumerPrice)); // Expected price of THEO per ETH, in THEO decimals (9)

    // Calculate the `expectedPayout` in THEO (9 decimals)
    expectedPayout = Math.floor((Number(depositAmount) * 1e18) / expectedPrice / 10 ** 18); // 10**18 decimals for ETH
  });

  describe('Deployment', function () {
    it('can be deployed', async function () {
      await setup();
    });
  });

  describe('Create market', function () {
    it('can be created with the address of a price consumer', async function () {
      expect(await WhitelistBondDepository.isLive(marketId)).to.equal(true);
    });

    it('stores the price consumer address in the Market information', async function () {
      const [, , priceFeed] = await WhitelistBondDepository.markets(marketId);
      expect(priceFeed).to.equal(rinkebyEthUsdPriceFeed);
    });

    it('keeps a record of the fixed USD price of THEO (the bond price) for the market', async function () {
      const [, , , , , , , , usdPricePerTHEO] = await WhitelistBondDepository.markets(marketId);
      expect(usdPricePerTHEO).to.equal(initialPrice);
    });

    it('allows a theo bond price to be less than 1 USD', async function () {
      const [, , bob] = users;
      const block = await ethers.provider.getBlock('latest');
      const conclusion = block.timestamp + timeToConclusion;
      const subUsdInitialPrice = 1_000_000 // 0.001 USD per THEO (9 decimals)

      await WhitelistBondDepository.create(
        WETH9.address,
        rinkebyEthUsdPriceFeed,
        [capacity, subUsdInitialPrice, buffer],
        [capacityInQuote, fixedTerm],
        [vesting, conclusion],
        [depositInterval, tuneInterval]
      );

      expect(await WhitelistBondDepository.isLive(1)).to.equal(true);
    });

  });

  describe('Deposit', function () {
    it('should allow a deposit', async function () {
      const [, , bob] = users;

      await bob.WhitelistBondDepository.deposit(marketId, depositAmount, maxPrice, bob.address, bob.address);
      const bobNotesIndexes = await WhitelistBondDepository.indexesFor(bob.address);

      expect(bobNotesIndexes.length).to.equal(1);
    });

    it('emits the price of theo per quote token', async function () {
      const [, , bob] = users;

      const depositAmount = ethers.utils.parseEther('25');
      const maxPrice = ethers.utils.parseEther('25');

      await expect(bob.WhitelistBondDepository.deposit(marketId, depositAmount, maxPrice, bob.address, bob.address))
        .to.emit(WhitelistBondDepository, 'Bond')
        .withArgs(marketId, depositAmount, expectedPrice);
    });

    it('adds the payout (due in THEO, 9 decimals) to the total amount of THEO sold by the market', async function () {
      const [, , bob] = users;

      const depositAmount = ethers.utils.parseEther('25');
      const maxPrice = ethers.utils.parseEther('25');

      await bob.WhitelistBondDepository.deposit(marketId, depositAmount, maxPrice, bob.address, bob.address);
      const [, , , , , , sold] = await WhitelistBondDepository.markets(marketId);

      expect(Number(sold)).to.equal(expectedPayout);
    });

    it('adds the amount of quote tokens in the deposit to the total amount purchased by the market', async function () {
      const [, , bob] = users;

      const depositAmount = ethers.utils.parseEther('25');
      const maxPrice = ethers.utils.parseEther('25');

      await bob.WhitelistBondDepository.deposit(marketId, depositAmount, maxPrice, bob.address, bob.address);
      const [, , , , , , , purchased] = await WhitelistBondDepository.markets(marketId);

      expect(Number(purchased)).to.equal(Number(depositAmount));
    });
  });

  describe('External view', function () {
    it('can give the current price of THEO per quote token', async function () {
      expect(await WhitelistBondDepository.calculatePrice(marketId)).to.equal(expectedPrice);
    });

    it('can give the payout expected in THEO (9 decimals) for a specified amount of quote tokens', async function () {
      const amount = ethers.utils.parseEther('100')
      const expectedPayoutQuote = Math.floor(Number(amount) / expectedPrice); // Amount of quote tokens divided by current price of THEO per quote token

      expect(await WhitelistBondDepository.payoutFor(amount, marketId)).to.equal(expectedPayoutQuote);
    });
  });
});
