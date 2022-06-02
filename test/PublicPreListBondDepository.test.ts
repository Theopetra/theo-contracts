import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';

import {
  WETH9,
  SignerHelper__factory,
  SignerHelper,
  TheopetraAuthority,
  UsdcERC20Mock,
  AggregatorMockETH,
  AggregatorMockUSDC,
  TheopetraStaking,
  TheopetraERC20Token,
  TheopetraTreasury,
  WethHelper,
  PublicPreListBondDepository,
} from '../typechain-types';
import { setupUsers } from './utils';
import { CONTRACTS, TESTWITHMOCKS } from '../utils/constants';
import { getContracts } from '../utils/helpers';

const setup = deployments.createFixture(async function () {
  await deployments.fixture();

  const { deployer: owner } = await getNamedAccounts();

  const contracts = await getContracts(CONTRACTS.publicPreListBondDepo);

  const users = await setupUsers(await getUnnamedAccounts(), contracts);

  return {
    ...contracts,
    users,
    owner,
  };
});

describe(' Public Pre-List Bond Depository', function () {
  const LARGE_APPROVAL = '100000000000000000000000000000000';

  // Market-specific
  const capacity = 1e14;
  const fixedBondPrice = 10e9; // 10 USD per THEO (9 decimals)
  const capacityInQuote = false;
  const fixedTerm = true;
  const vesting = 100;
  const timeToConclusion = 60 * 60 * 24;
  const marketId = 0;

  // Deposit-specific, for WETH deposits
  const depositAmount = ethers.utils.parseEther('25');
  const maxPrice = ethers.utils.parseEther('25');

  // Deposit-specific, for USDC deposits
  const usdcDepositAmount = 100_000_000; // // 1e8, equivalent to 100 USDC (6 decimals for USDC)

  let PublicPreListBondDepository: PublicPreListBondDepository;
  let WETH9: WETH9;
  let TheopetraAuthority: TheopetraAuthority;
  let TheopetraERC20Token: TheopetraERC20Token;
  let Staking: TheopetraStaking;
  let sTheo: any;
  let AggregatorMockETH: AggregatorMockETH;
  let UsdcTokenMock: UsdcERC20Mock;
  let AggregatorMockUSDC: AggregatorMockUSDC;
  let Treasury: TheopetraTreasury;
  let WethHelper: WethHelper;
  let SignerHelper: SignerHelper;
  let users: any;
  let signature: any;

  let expectedPricePerWETH: number;
  let expectedPayoutTheoWEth: number;
  let expectedPricePerUSDC: number;
  let expectedPayoutTheoUsdc: number;
  let usdcMarketId: any;

  beforeEach(async function () {
    ({
      PublicPreListBondDepository,
      WETH9,
      TheopetraAuthority,
      TheopetraERC20Token,
      Staking,
      sTheo,
      AggregatorMockETH,
      AggregatorMockUSDC,
      UsdcTokenMock,
      Treasury,
      WethHelper,
      users,
    } = await setup());
    const [, , bob] = users;
    const block = await ethers.provider.getBlock('latest');
    const conclusion = block.timestamp + timeToConclusion;

    // Deposit / mint quote tokens and approve transfer for PublicPreListBondDepository, to allow deposits
    await bob.WETH9.deposit({ value: ethers.utils.parseEther('1000') });
    await bob.WETH9.approve(PublicPreListBondDepository.address, LARGE_APPROVAL);
    await UsdcTokenMock.mint(bob.address, 100_000_000_000); // 100_000 USDC (6 decimals for USDC)
    await bob.UsdcTokenMock.approve(PublicPreListBondDepository.address, LARGE_APPROVAL);

    // Setup to mint initial amount of THEO
    const [, treasurySigner] = await ethers.getSigners();
    await TheopetraAuthority.pushVault(treasurySigner.address, true); //
    await TheopetraERC20Token.connect(treasurySigner).mint(PublicPreListBondDepository.address, '10000000000000000'); // 1e16 Set to be same as return value in Treasury Mock for baseSupply
    await TheopetraAuthority.pushVault(Treasury.address, true); // Restore Treasury contract as Vault

    await PublicPreListBondDepository.create(
      WETH9.address,
      AggregatorMockETH.address,
      [capacity, fixedBondPrice],
      [capacityInQuote, fixedTerm],
      [vesting, conclusion]
    );

    if (process.env.NODE_ENV === TESTWITHMOCKS) {
      // Only call this if using mock sTheo, as only the mock has a mint function (sTheo itself uses `initialize` instead)
      await sTheo.mint(PublicPreListBondDepository.address, '1000000000000000000000');
    }

    // Calculate the `expectedPricePerWETH` (9 decimals) of THEO per ETH using mock price consumer values
    const [, mockPriceConsumerPrice] = await AggregatorMockETH.latestRoundData();
    const mockPriceConsumerDecimals = await AggregatorMockETH.decimals();
    const expectedScaledPrice = fixedBondPrice * 10 ** (mockPriceConsumerDecimals + 9 - 9); // mockPriceConsumerDecimals + THEO decimals (9) - usdPerTHEO decimals (9)
    expectedPricePerWETH = Math.floor(Number(expectedScaledPrice) / Number(mockPriceConsumerPrice)); // Expected price of THEO per ETH, in THEO decimals (9)

    // Calculate the `expectedPayoutTheoWEth` (that is, the THEO payout for a WETH-THEO bond market) in THEO (9 decimals)
    expectedPayoutTheoWEth = Math.floor((Number(depositAmount) * 1e18) / expectedPricePerWETH / 10 ** 18); //1e18 = theo decimals (9) + fixed bond price decimals (9); 10**18 decimals for ETH

    // Calculate the `expectedPricePerUSDC` (9 decimals) of THEO per USDC using mock price consumer values
    // Example: `expectedPricePerUSDC` of 10_000_000_000 means Theo is 10x USDC price (i.e. 10 USDC per THEO)
    const [, mockPriceConsumerPriceUSDC] = await AggregatorMockUSDC.latestRoundData();
    const mockPriceConsumerDecimalsUSDC = await AggregatorMockUSDC.decimals();
    const expectedScaledPriceUSDC = fixedBondPrice * 10 ** (mockPriceConsumerDecimalsUSDC + 9 - 9); // mockPriceConsumerDecimalsUSDC + THEO decimals (9) - usdPerTHEO decimals (9)
    expectedPricePerUSDC = Math.floor(Number(expectedScaledPriceUSDC) / Number(mockPriceConsumerPriceUSDC)); // Expected price of THEO per ETH, in THEO decimals (9)

    // Calculate the `expectedPayoutTheoUsdc` (that is, the THEO payout for USDC amount deposited to a USDC-THEO bond market) in THEO (9 decimals)
    // Example: deposit of 100_000_000 (100 USDC, with 6 decimals), `expectedPricePerUSDC` of 10_000_000_000 (i.e. Theo is 10x USDC price)
    // Expect payout of 10_000_000_000 THEO (10 THEO, with 9 decimals)
    expectedPayoutTheoUsdc = Math.floor((Number(usdcDepositAmount) * 1e18) / expectedPricePerUSDC / 10 ** 6); // 1e18 = theo decimals (9) + fixed bond price decimals (9); 10**6 decimals for USDC
  });

  async function setupForDeposit() {
    const [governorWallet] = await ethers.getSigners();

    // Deploy SignerHelper contract
    const signerHelperFactory = new SignerHelper__factory(governorWallet);
    SignerHelper = await signerHelperFactory.deploy();

    const addressZero = ethers.utils.getAddress('0x0000000000000000000000000000000000000000');
    const arbitraryHash = await SignerHelper.createHash(
      'thisIsNotTheCorrectData',
      addressZero,
      addressZero,
      'anything'
    );

    // 32 bytes of data in Uint8Array
    const messageHashBinary = ethers.utils.arrayify(arbitraryHash);

    // To sign the 32 bytes of data, pass in the data
    signature = await governorWallet.signMessage(messageHashBinary);

    // Create second market, with USDC as quote token
    const usdcMarketblock = await ethers.provider.getBlock('latest');
    const usdcMarketconclusion = usdcMarketblock.timestamp + timeToConclusion;
    await PublicPreListBondDepository.create(
      UsdcTokenMock.address,
      AggregatorMockUSDC.address,
      [capacity, fixedBondPrice],
      [capacityInQuote, fixedTerm],
      [vesting, usdcMarketconclusion]
    );
    [usdcMarketId] = await PublicPreListBondDepository.liveMarketsFor(UsdcTokenMock.address);
    expect(Number(usdcMarketId)).to.equal(1);
  }

  describe('Deployment', function () {
    it('can be deployed', async function () {
      await setup();
    });
  });

  describe('Create market', function () {
    it('can be created', async function () {
      expect(await PublicPreListBondDepository.isLive(marketId)).to.equal(true);
    });

    it('stores the price consumer address in the Market information', async function () {
      const [, , priceFeed] = await PublicPreListBondDepository.markets(marketId);
      expect(priceFeed).to.equal(AggregatorMockETH.address);
    });

    it('keeps a record of the fixed USD price of THEO (the bond price) for the market', async function () {
      const [, , , , , , usdPricePerTHEO] = await PublicPreListBondDepository.markets(marketId);
      expect(usdPricePerTHEO).to.equal(fixedBondPrice);
    });

    it('emits a Create Market event when created, which includes the fixed bond price', async function () {
      const block = await ethers.provider.getBlock('latest');
      const conclusion = block.timestamp + timeToConclusion;

      await expect(
        PublicPreListBondDepository.create(
          WETH9.address,
          AggregatorMockETH.address,
          [capacity, fixedBondPrice],
          [capacityInQuote, fixedTerm],
          [vesting, conclusion]
        )
      )
        .to.emit(PublicPreListBondDepository, 'CreateMarket')
        .withArgs(1, TheopetraERC20Token.address, WETH9.address, fixedBondPrice);
    });

    it('allows a theo bond price to be less than 1 USD', async function () {
      const block = await ethers.provider.getBlock('latest');
      const conclusion = block.timestamp + timeToConclusion;
      const subUsdFixedBondPrice = 1_000_000; // 0.001 USD per THEO (9 decimals)

      await PublicPreListBondDepository.create(
        WETH9.address,
        AggregatorMockETH.address,
        [capacity, subUsdFixedBondPrice],
        [capacityInQuote, fixedTerm],
        [vesting, conclusion]
      );

      expect(await PublicPreListBondDepository.isLive(1)).to.equal(true);
    });

    it('should revert if an address other than the policy owner makes a call to create a market', async function () {
      const [, alice] = users;
      const block = await ethers.provider.getBlock('latest');
      const conclusion = block.timestamp + timeToConclusion;

      await expect(
        alice.PublicPreListBondDepository.create(
          WETH9.address,
          AggregatorMockETH.address,
          [capacity, fixedBondPrice],
          [capacityInQuote, fixedTerm],
          [vesting, conclusion]
        )
      ).to.be.revertedWith('UNAUTHORIZED');
    });

    it('should return the ids of all markets', async function () {
      const block = await ethers.provider.getBlock('latest');
      const conclusion = block.timestamp + timeToConclusion;

      await PublicPreListBondDepository.create(
        WETH9.address,
        AggregatorMockETH.address,
        [capacity, fixedBondPrice],
        [capacityInQuote, fixedTerm],
        [vesting, conclusion]
      );
      const [firstMarketId, secondMarketId] = await PublicPreListBondDepository.liveMarkets();
      expect(Number(firstMarketId)).to.equal(0);
      expect(Number(secondMarketId)).to.equal(1);
    });

    it('allows a market with USDC as the quote token', async function () {
      const block = await ethers.provider.getBlock('latest');
      const conclusion = block.timestamp + timeToConclusion;

      // New market for USDC
      await PublicPreListBondDepository.create(
        UsdcTokenMock.address,
        AggregatorMockUSDC.address,
        [capacity, fixedBondPrice],
        [capacityInQuote, fixedTerm],
        [vesting, conclusion]
      );

      expect(await PublicPreListBondDepository.isLive(marketId)).to.equal(true);
      expect(await PublicPreListBondDepository.isLive(1)).to.equal(true);
    });

    it('allows a market with a USDC quote token to have a theo bond price of less than 1 USD', async function () {
      const block = await ethers.provider.getBlock('latest');
      const conclusion = block.timestamp + timeToConclusion;
      const subUsdFixedBondPrice = 1_000_000; // 0.001 USD per THEO (9 decimals)

      await PublicPreListBondDepository.create(
        UsdcTokenMock.address,
        AggregatorMockUSDC.address,
        [capacity, subUsdFixedBondPrice],
        [capacityInQuote, fixedTerm],
        [vesting, conclusion]
      );

      expect(await PublicPreListBondDepository.isLive(1)).to.equal(true);
    });

    it('allows a market capacity to be set in quote tokens', async function () {
      const block = await ethers.provider.getBlock('latest');
      const conclusion = block.timestamp + timeToConclusion;

      const isCapacitySetInQuoteTokenAmount = true;

      await expect(
        PublicPreListBondDepository.create(
          WETH9.address,
          AggregatorMockETH.address,
          [capacity, fixedBondPrice],
          [isCapacitySetInQuoteTokenAmount, fixedTerm],
          [vesting, conclusion]
        )
      ).to.not.be.reverted;
    });
  });

  describe('deposit', function () {
    beforeEach(async function () {
      await setupForDeposit();
    });

    it('should allow a deposit to a WETH-THEO market (using an arbitrary signature)', async function () {
      const [, , bob] = users;

      await bob.PublicPreListBondDepository.deposit(
        marketId,
        depositAmount,
        maxPrice,
        bob.address,
        bob.address,
        signature
      );
      const bobNotesIndexes = await PublicPreListBondDepository.indexesFor(bob.address);

      expect(bobNotesIndexes.length).to.equal(1);
    });

    it('should allow a deposit to a USDC-THEO market', async function () {
      const [, , bob] = users;

      await bob.PublicPreListBondDepository.deposit(
        usdcMarketId,
        usdcDepositAmount,
        maxPrice,
        bob.address,
        bob.address,
        signature
      );
      const bobNotesIndexes = await PublicPreListBondDepository.indexesFor(bob.address);

      expect(bobNotesIndexes.length).to.equal(1);
    });

    it('should not change the (fixed) bond price', async function () {
      const [, , bob] = users;

      await bob.PublicPreListBondDepository.deposit(
        marketId,
        depositAmount,
        maxPrice,
        bob.address,
        bob.address,
        signature
      );
      const [, , , , , , usdPricePerTHEO] = await PublicPreListBondDepository.markets(marketId);

      expect(Number(usdPricePerTHEO)).to.equal(fixedBondPrice);
    });

    it('emits the price of theo per quote token', async function () {
      const [, , bob] = users;

      await expect(
        bob.PublicPreListBondDepository.deposit(marketId, depositAmount, maxPrice, bob.address, bob.address, signature)
      )
        .to.emit(PublicPreListBondDepository, 'Bond')
        .withArgs(marketId, depositAmount, expectedPricePerWETH);
    });

    it('adds the payout (due in THEO, 9 decimals) to the total amount of THEO sold by a WETH-THEO market', async function () {
      const [, , bob] = users;

      await bob.PublicPreListBondDepository.deposit(
        marketId,
        depositAmount,
        maxPrice,
        bob.address,
        bob.address,
        signature
      );
      const [, , , , sold] = await PublicPreListBondDepository.markets(marketId);

      expect(Number(sold)).to.equal(expectedPayoutTheoWEth);
    });

    it('adds the payout (due in THEO, 9 decimals) to the total amount of THEO sold by a USDC-THEO market', async function () {
      const [, , bob] = users;

      await bob.PublicPreListBondDepository.deposit(
        usdcMarketId,
        usdcDepositAmount,
        maxPrice,
        bob.address,
        bob.address,
        signature
      );
      const [, , , , sold] = await PublicPreListBondDepository.markets(usdcMarketId);

      expect(Number(sold)).to.equal(expectedPayoutTheoUsdc);
    });

    it('does not change the payout (if the price of THEO per quote token remains the same)', async function () {
      const [, , bob] = users;

      await bob.PublicPreListBondDepository.deposit(
        marketId,
        depositAmount,
        maxPrice,
        bob.address,
        bob.address,
        signature
      );
      const [payout1_] = await PublicPreListBondDepository.pendingFor(bob.address, 0);

      await bob.PublicPreListBondDepository.deposit(
        marketId,
        depositAmount,
        maxPrice,
        bob.address,
        bob.address,
        signature
      );
      const [payout2_] = await PublicPreListBondDepository.pendingFor(bob.address, 1);

      expect(payout1_).to.equal(payout2_);
      expect(Number(payout1_) + Number(payout2_)).to.equal(2 * expectedPayoutTheoWEth);
    });

    it('adds the amount of quote tokens in the deposit to the total amount purchased by the market', async function () {
      const [, , bob] = users;

      await bob.PublicPreListBondDepository.deposit(
        marketId,
        depositAmount,
        maxPrice,
        bob.address,
        bob.address,
        signature
      );
      const [, , , , , purchased] = await PublicPreListBondDepository.markets(marketId);

      expect(Number(purchased)).to.equal(Number(depositAmount));
    });

    it('mints the payout in THEO', async function () {
      const [, , bob, carol] = users;

      const initialTotalTheoSupply = await TheopetraERC20Token.totalSupply();

      await bob.PublicPreListBondDepository.deposit(
        marketId,
        depositAmount,
        maxPrice,
        bob.address,
        carol.address,
        signature
      );

      const newTotalTheoSupply = await TheopetraERC20Token.totalSupply();
      const [payout_] = await PublicPreListBondDepository.pendingFor(bob.address, 0);

      expect(Number(newTotalTheoSupply) - Number(initialTotalTheoSupply)).to.equal(payout_);
    });

    it('does not the payout', async function () {
      const [, , bob] = users;

      const initialStakingTheoBalance = await TheopetraERC20Token.balanceOf(Staking.address);

      await bob.PublicPreListBondDepository.deposit(
        marketId,
        depositAmount,
        maxPrice,
        bob.address,
        bob.address,
        signature
      );

      const newStakingTHEOBalance = await TheopetraERC20Token.balanceOf(Staking.address);
      expect(Number(initialStakingTheoBalance)).to.be.equal(Number(newStakingTHEOBalance));

      const [payout_] = await PublicPreListBondDepository.pendingFor(bob.address, 0);
      const expectedPayout = Math.floor(Number(depositAmount) / expectedPricePerWETH);
      expect(expectedPayout).to.equal(payout_);
    });

    it('will revert if the attempted deposit amount is larger than the market capacity', async function () {
      const [, , bob] = users;
      const tooBigDepositAmount = ethers.utils.parseEther('2000');

      await expect(
        bob.PublicPreListBondDepository.deposit(
          marketId,
          tooBigDepositAmount,
          tooBigDepositAmount,
          bob.address,
          bob.address,
          signature
        )
      ).to.be.revertedWith('Depository: capacity exceeded');
    });

    it('will reduce the capacity remaining for the market when a deposit is made', async function () {
      const [, , bob] = users;
      const firstDepositAmount = ethers.utils.parseEther('25');

      await bob.PublicPreListBondDepository.deposit(
        marketId,
        firstDepositAmount,
        firstDepositAmount,
        bob.address,
        bob.address,
        signature
      );

      const [capacityAfterDeposit] = await PublicPreListBondDepository.markets(marketId);
      expect(Number(capacityAfterDeposit)).to.be.lessThan(capacity);
    });

    it('will allow deposits up to the market capacity but will revert deposit attempts after capacity is reached', async function () {
      const [, , bob] = users;

      await bob.PublicPreListBondDepository.deposit(
        marketId,
        depositAmount,
        maxPrice,
        bob.address,
        bob.address,
        signature
      );

      await bob.PublicPreListBondDepository.deposit(
        marketId,
        depositAmount,
        maxPrice,
        bob.address,
        bob.address,
        signature
      );

      const [capacity] = await PublicPreListBondDepository.markets(marketId);
      const bigDepositAmount = ethers.utils.parseEther('299');
      const payoutForBigDeposit = await PublicPreListBondDepository.payoutFor(bigDepositAmount, marketId);
      expect(Number(capacity) - Number(payoutForBigDeposit) < 0);

      await expect(
        bob.PublicPreListBondDepository.deposit(
          marketId,
          bigDepositAmount,
          bigDepositAmount,
          bob.address,
          bob.address,
          signature
        )
      ).to.be.revertedWith('Depository: capacity exceeded');
    });

    it('allows deposits up to the market capacity (i.e. exactly zero capacity remaining; with market cap set in quote token-terms)', async function () {
      const [, , bob] = users;
      const block = await ethers.provider.getBlock('latest');
      const conclusion = block.timestamp + timeToConclusion;

      const isCapacitySetInQuoteTokenAmount = true;
      const lowCapacity = ethers.utils.parseEther('100'); // 100 ETH (18 decimals)
      const firstDepositAmount = ethers.utils.parseEther('25');

      await PublicPreListBondDepository.create(
        WETH9.address,
        AggregatorMockETH.address,
        [lowCapacity, fixedBondPrice],
        [isCapacitySetInQuoteTokenAmount, fixedTerm],
        [vesting, conclusion]
      );

      const [capacity] = await PublicPreListBondDepository.markets(2); // Market Id is 2, as there are already two other markets created previously
      expect(Number(capacity)).to.equal(Number(lowCapacity));
      // First deposit
      await bob.PublicPreListBondDepository.deposit(
        2,
        firstDepositAmount,
        maxPrice,
        bob.address,
        bob.address,
        signature
      );
      const [newCapacity] = await PublicPreListBondDepository.markets(2);
      expect(Number(newCapacity)).to.equal(Number(lowCapacity) - Number(firstDepositAmount));

      // Second deposit, with 75 ETH to reach zero capacity remaining
      const hitCapDepositAmount = ethers.utils.parseEther('75');
      await bob.PublicPreListBondDepository.deposit(
        2,
        hitCapDepositAmount,
        hitCapDepositAmount,
        bob.address,
        bob.address,
        signature
      );
      const [finalCapacity] = await PublicPreListBondDepository.markets(2);
      expect(Number(finalCapacity)).to.equal(0);
    });

    it('will emit a CloseMarket event when capacity is reached (market capacity is set in quote token-terms)', async function () {
      const [, , bob] = users;
      const block = await ethers.provider.getBlock('latest');
      const conclusion = block.timestamp + timeToConclusion;

      const isCapacitySetInQuoteTokenAmount = true;
      const lowCapacity = ethers.utils.parseEther('100');

      await PublicPreListBondDepository.create(
        WETH9.address,
        AggregatorMockETH.address,
        [lowCapacity, fixedBondPrice],
        [isCapacitySetInQuoteTokenAmount, fixedTerm],
        [vesting, conclusion]
      );

      // 100 ETH to hit capacity of 100 ETH
      const hitCapDepositAmount = ethers.utils.parseEther('100');
      await expect(
        bob.PublicPreListBondDepository.deposit(
          2,
          hitCapDepositAmount,
          hitCapDepositAmount,
          bob.address,
          bob.address,
          signature
        )
      )
        .to.emit(PublicPreListBondDepository, 'CloseMarket')
        .withArgs(2);
    });

    it('will revert when market capacity is breached, when capacity is set in quote token-terms', async function () {
      const [, , bob] = users;
      const block = await ethers.provider.getBlock('latest');
      const conclusion = block.timestamp + timeToConclusion;

      const isCapacitySetInQuoteTokenAmount = true;
      const lowCapacity = ethers.utils.parseEther('100');

      await PublicPreListBondDepository.create(
        WETH9.address,
        AggregatorMockETH.address,
        [lowCapacity, fixedBondPrice],
        [isCapacitySetInQuoteTokenAmount, fixedTerm],
        [vesting, conclusion]
      );

      // Second deposit, 101 ETH to breach capacity of 100 ETH
      const breachCapDepositAmount = ethers.utils.parseEther('101');
      await expect(
        bob.PublicPreListBondDepository.deposit(
          2,
          breachCapDepositAmount,
          breachCapDepositAmount,
          bob.address,
          bob.address,
          signature
        )
      ).to.be.revertedWith('Depository: capacity exceeded');
    });
  });

  describe('Redeem', function () {
    beforeEach(async function () {
      await setupForDeposit();
    });

    it('should allow a note to be redeemed for THEO', async function () {
      const [, , bob] = users;
      const initialBobBalance = await bob.TheopetraERC20Token.balanceOf(bob.address);
      await bob.PublicPreListBondDepository.deposit(
        usdcMarketId,
        usdcDepositAmount,
        maxPrice,
        bob.address,
        bob.address,
        signature
      );

      const latestBlock = await ethers.provider.getBlock('latest');
      const newTimestampInSeconds = latestBlock.timestamp + vesting * 2;
      await ethers.provider.send('evm_mine', [newTimestampInSeconds]);

      await expect(PublicPreListBondDepository.redeemAll(bob.address)).to.not.be.reverted;
      const finalBobBalance = await bob.TheopetraERC20Token.balanceOf(bob.address);
      expect(Number(finalBobBalance)).to.be.greaterThan(Number(initialBobBalance));
    });
  });

  describe('External view', function () {
    it('can give the current price of THEO per quote token', async function () {
      expect(await PublicPreListBondDepository.calculatePrice(marketId)).to.equal(expectedPricePerWETH);
    });

    it('can give the payout expected in THEO (9 decimals) for a specified amount of quote tokens', async function () {
      const amount = ethers.utils.parseEther('100');
      const expectedPayoutQuote = Math.floor(Number(amount) / expectedPricePerWETH); // Amount of quote tokens divided by current price of THEO per quote token

      expect(await PublicPreListBondDepository.payoutFor(amount, marketId)).to.equal(expectedPayoutQuote);
    });
  });

  describe('Close market', function () {
    beforeEach(async function () {
      const [governorWallet] = await ethers.getSigners();
      const [, , bob] = users;

      // Deploy SignerHelper contract
      const signerHelperFactory = new SignerHelper__factory(governorWallet);
      const SignerHelper = await signerHelperFactory.deploy();
      // Create a hash in the same way as created by Signed contract
      const bobHash = await SignerHelper.createHash(
        '',
        bob.address,
        PublicPreListBondDepository.address,
        'supersecret'
      );

      // Set the secret on the Signed contract
      await PublicPreListBondDepository.setSecret('supersecret');

      // 32 bytes of data in Uint8Array
      const messageHashBinary = ethers.utils.arrayify(bobHash);

      // To sign the 32 bytes of data, pass in the data
      signature = await governorWallet.signMessage(messageHashBinary);
    });

    it('should allow a policy owner to close a market', async function () {
      let marketCap;
      [marketCap, , , , , ,] = await PublicPreListBondDepository.markets(marketId);
      expect(Number(marketCap)).to.be.greaterThan(0);

      await PublicPreListBondDepository.close(marketId);

      [marketCap, , , , , ,] = await PublicPreListBondDepository.markets(marketId);
      expect(Number(marketCap)).to.equal(0);
      expect(await PublicPreListBondDepository.isLive(marketId)).to.equal(false);
    });

    it('should revert if an address other than the policy owner makes a call to close a market', async function () {
      const [, , bob] = users;

      await expect(bob.PublicPreListBondDepository.close(marketId)).to.be.revertedWith('UNAUTHORIZED');
    });

    it('should emit a Close Market event, with the id of the closed market, when closed', async function () {
      await expect(PublicPreListBondDepository.close(marketId))
        .to.emit(PublicPreListBondDepository, 'CloseMarket')
        .withArgs(marketId);
    });

    it('should not allow any new deposits after the market is closed', async function () {
      const [, , bob] = users;

      // Check the market allows a deposit before closing
      await expect(
        bob.PublicPreListBondDepository.deposit(marketId, depositAmount, maxPrice, bob.address, bob.address, signature)
      ).to.not.be.reverted;

      await PublicPreListBondDepository.close(marketId);

      await expect(
        bob.PublicPreListBondDepository.deposit(marketId, depositAmount, maxPrice, bob.address, bob.address, signature)
      ).to.be.revertedWith('Depository: market concluded');
    });

    it('does not allow further deposits after capacity (set in quote token terms) becomes zero via a previous deposit, which effectively closes the market', async function () {
      const [, , bob] = users;
      const block = await ethers.provider.getBlock('latest');
      const conclusion = block.timestamp + timeToConclusion;

      const isCapacitySetInQuoteTokenAmount = true;
      const lowCapacity = ethers.utils.parseEther('100');

      await PublicPreListBondDepository.create(
        WETH9.address,
        AggregatorMockETH.address,
        [lowCapacity, fixedBondPrice],
        [isCapacitySetInQuoteTokenAmount, fixedTerm],
        [vesting, conclusion]
      );
      const [capacity] = await PublicPreListBondDepository.markets(1); // Market Id is 2, as there are already two other markets created previously
      expect(Number(capacity)).to.equal(Number(lowCapacity));

      // 100 ETH to hit capacity of 100 ETH
      const hitCapDepositAmount = ethers.utils.parseEther('100');
      await expect(
        bob.PublicPreListBondDepository.deposit(
          1,
          hitCapDepositAmount,
          hitCapDepositAmount,
          bob.address,
          bob.address,
          signature
        )
      )
        .to.emit(PublicPreListBondDepository, 'CloseMarket')
        .withArgs(1);

      const secondDepositAmount = ethers.utils.parseEther('1');
      await expect(
        bob.PublicPreListBondDepository.deposit(
          1,
          secondDepositAmount,
          secondDepositAmount,
          bob.address,
          bob.address,
          signature
        )
      ).to.be.revertedWith('Depository: capacity exceeded');
    });

    it('should close after the specified time-to-conclusion for the market has passed', async function () {
      const latestBlock = await ethers.provider.getBlock('latest');
      const newTimestampInSeconds = latestBlock.timestamp + timeToConclusion * 2;
      await ethers.provider.send('evm_mine', [newTimestampInSeconds]);

      expect(await PublicPreListBondDepository.isLive(marketId)).to.equal(false);
    });
  });
});
