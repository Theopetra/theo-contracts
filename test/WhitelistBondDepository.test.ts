import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';
import {
  WhitelistTheopetraBondDepository,
  WETH9,
  SignerHelper__factory,
  PriceConsumerV3Mock,
  SignerHelper,
  TheopetraAuthority,
} from '../typechain-types';
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
    TheopetraAuthority: <TheopetraAuthority>await ethers.getContract(CONTRACTS.authority),
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

describe.only('Whitelist Bond depository', function () {
  const LARGE_APPROVAL = '100000000000000000000000000000000';
  const rinkebyEthUsdPriceFeed = '0x8A753747A1Fa494EC906cE90E9f37563A8AF630e';

  // Market-specific
  const capacity = 1e14;
  const fixedBondPrice = 10e9; // 10 USD per THEO (9 decimals)
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
  let TheopetraAuthority: TheopetraAuthority;
  let TheopetraERC20Mock: any;
  let users: any;
  let owner: any;
  let signature: any;

  let expectedPrice: number;
  let expectedPayout: number;

  beforeEach(async function () {
    ({ WhitelistBondDepository, WETH9, PriceConsumerV3Mock, TheopetraAuthority, TheopetraERC20Mock, users, owner } =
      await setup());
    const [, , bob] = users;
    const block = await ethers.provider.getBlock('latest');
    const conclusion = block.timestamp + timeToConclusion;

    await bob.WETH9.deposit({ value: ethers.utils.parseEther('100') });

    await bob.WETH9.approve(WhitelistBondDepository.address, LARGE_APPROVAL);

    await WhitelistBondDepository.create(
      WETH9.address,
      rinkebyEthUsdPriceFeed,
      [capacity, fixedBondPrice, buffer],
      [capacityInQuote, fixedTerm],
      [vesting, conclusion],
      [depositInterval, tuneInterval]
    );

    // Calculate the `expectedPrice` of THEO per ETH using mock price consumer values
    const [mockPriceConsumerPrice, mockPriceConsumerDecimals] = await PriceConsumerV3Mock.getLatestPrice(
      rinkebyEthUsdPriceFeed
    );
    const expectedScaledPrice = fixedBondPrice * 10 ** (mockPriceConsumerDecimals + 9 - 9); // mockPriceConsumerDecimals + THEO decimals (9) - usdPerTHEO decimals (0)
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
    it('can be created', async function () {
      expect(await WhitelistBondDepository.isLive(marketId)).to.equal(true);
    });

    it('stores the price consumer address in the Market information', async function () {
      const [, , priceFeed] = await WhitelistBondDepository.markets(marketId);
      expect(priceFeed).to.equal(rinkebyEthUsdPriceFeed);
    });

    it('keeps a record of the fixed USD price of THEO (the bond price) for the market', async function () {
      const [, , , , , , , , usdPricePerTHEO] = await WhitelistBondDepository.markets(marketId);
      expect(usdPricePerTHEO).to.equal(fixedBondPrice);
    });

    it('emits a Create Market event when created, which includes the fixed bond price', async function () {
      const block = await ethers.provider.getBlock('latest');
      const conclusion = block.timestamp + timeToConclusion;

      await expect(
        WhitelistBondDepository.create(
          WETH9.address,
          rinkebyEthUsdPriceFeed,
          [capacity, fixedBondPrice, buffer],
          [capacityInQuote, fixedTerm],
          [vesting, conclusion],
          [depositInterval, tuneInterval]
        )
      )
        .to.emit(WhitelistBondDepository, 'CreateMarket')
        .withArgs(1, TheopetraERC20Mock.address, WETH9.address, fixedBondPrice);
    });

    it('allows a theo bond price to be less than 1 USD', async function () {
      const block = await ethers.provider.getBlock('latest');
      const conclusion = block.timestamp + timeToConclusion;
      const subUsdFixedBondPrice = 1_000_000; // 0.001 USD per THEO (9 decimals)

      await WhitelistBondDepository.create(
        WETH9.address,
        rinkebyEthUsdPriceFeed,
        [capacity, subUsdFixedBondPrice, buffer],
        [capacityInQuote, fixedTerm],
        [vesting, conclusion],
        [depositInterval, tuneInterval]
      );

      expect(await WhitelistBondDepository.isLive(1)).to.equal(true);
    });

    it('should revert if an address other than the policy owner makes a call to create a market', async function () {
      const [, alice] = users;
      const block = await ethers.provider.getBlock('latest');
      const conclusion = block.timestamp + timeToConclusion;

      await expect(
        alice.WhitelistBondDepository.create(
          WETH9.address,
          rinkebyEthUsdPriceFeed,
          [capacity, fixedBondPrice, buffer],
          [capacityInQuote, fixedTerm],
          [vesting, conclusion],
          [depositInterval, tuneInterval]
        )
      ).to.be.revertedWith('UNAUTHORIZED');
    });
  });

  describe('Deposit signature verification', function () {
    let SignerHelper: SignerHelper;

    beforeEach(async function () {
      const [governorWallet] = await ethers.getSigners();

      // Deploy SignerHelper contract
      const signerHelperFactory = new SignerHelper__factory(governorWallet);
      SignerHelper = await signerHelperFactory.deploy();

      // Set the secret on the Signed contract
      await WhitelistBondDepository.setSecret('supersecret');
    });

    it('reverts if a wallet that is not the governor (signer) tries to sign the message', async function () {
      const [, , bob] = users;
      const [, anotherUserWallet] = await ethers.getSigners();

      // Create a hash in the same way as created by Signed contract
      const bobHash = await SignerHelper.createHash(
        'somedata',
        bob.address,
        WhitelistBondDepository.address,
        'supersecret'
      );

      const messageHashBinary = ethers.utils.arrayify(bobHash);

      // Try to sign the message using another wallet (not the governor)
      signature = await anotherUserWallet.signMessage(messageHashBinary);

      await expect(
        bob.WhitelistBondDepository.deposit(marketId, depositAmount, maxPrice, bob.address, bob.address, signature)
      ).to.be.revertedWith('Signature verification failed');
    });

    it('after a new signer has been pushed, it should reverts if a wallet that is not the new signer tries to sign the message', async function () {
      const [, , bob] = users;
      const [oldSignerWallet, newSignerWallet] = await ethers.getSigners();

      // Push a new signer
      await TheopetraAuthority.pushWlSigner(newSignerWallet.address, true);
      expect(await TheopetraAuthority.wlSigner()).to.equal(newSignerWallet.address);

      // Create a hash in the same way as created by Signed contract
      const bobHash = await SignerHelper.createHash(
        'somedata',
        bob.address,
        WhitelistBondDepository.address,
        'supersecret'
      );

      const messageHashBinary = ethers.utils.arrayify(bobHash);

      // Try to sign the message using the old signer (governor) wallet
      signature = await oldSignerWallet.signMessage(messageHashBinary);

      await expect(
        bob.WhitelistBondDepository.deposit(marketId, depositAmount, maxPrice, bob.address, bob.address, signature)
      ).to.be.revertedWith('Signature verification failed');
    });

    it('reverts if the secret used for creating the hash via the SignerHelper does not match that set on the Signer contract', async function () {
      const [, , bob] = users;
      const [governorWallet] = await ethers.getSigners();

      // Create a hash in the same way as created by Signed contract
      const bobHash = await SignerHelper.createHash(
        'somedata',
        bob.address,
        WhitelistBondDepository.address,
        'supersecret'
      );

      const messageHashBinary = ethers.utils.arrayify(bobHash);

      // Set a new secret on the Signed contract
      await WhitelistBondDepository.setSecret('newAndImprovedSuperSecret');

      signature = await governorWallet.signMessage(messageHashBinary);

      await expect(
        bob.WhitelistBondDepository.deposit(marketId, depositAmount, maxPrice, bob.address, bob.address, signature)
      ).to.be.revertedWith('Signature verification failed');
    });

    it('reverts if the data used for creating the hash via the SignerHelper does not match that used in the Signer contract', async function () {
      const [, , bob] = users;
      const [governorWallet] = await ethers.getSigners();

      const bobHash = await SignerHelper.createHash(
        'thisIsNotTheCorrectData',
        bob.address,
        WhitelistBondDepository.address,
        'supersecret'
      );

      // 32 bytes of data in Uint8Array
      const messageHashBinary = ethers.utils.arrayify(bobHash);

      // To sign the 32 bytes of data, pass in the data
      signature = await governorWallet.signMessage(messageHashBinary);

      await expect(
        bob.WhitelistBondDepository.deposit(marketId, depositAmount, maxPrice, bob.address, bob.address, signature)
      ).to.be.revertedWith('Signature verification failed');
    });

    it('reverts if the user is not whitelisted', async function () {
      const [, alice, bob] = users;
      const [governorWallet] = await ethers.getSigners();

      await alice.WETH9.deposit({ value: ethers.utils.parseEther('100') });
      await alice.WETH9.approve(WhitelistBondDepository.address, LARGE_APPROVAL);

      //Whitelist alice as an example of a working deposit
      const aliceHash = await SignerHelper.createHash(
        'somedata',
        alice.address,
        WhitelistBondDepository.address,
        'supersecret'
      );
      const messageHashBinary = ethers.utils.arrayify(aliceHash);
      signature = await governorWallet.signMessage(messageHashBinary);

      // Alice can successfully deposit
      await alice.WhitelistBondDepository.deposit(
        marketId,
        depositAmount,
        maxPrice,
        alice.address,
        alice.address,
        signature
      );
      const aliceNotesIndexes = await WhitelistBondDepository.indexesFor(alice.address);
      expect(aliceNotesIndexes.length).to.equal(1);

      // Bob is not whitelisted and cannot deposit
      await expect(
        bob.WhitelistBondDepository.deposit(marketId, depositAmount, maxPrice, bob.address, bob.address, signature)
      ).to.be.revertedWith('Signature verification failed');
    });
  });

  describe('Deposit success', function () {
    beforeEach(async function () {
      const [governorWallet] = await ethers.getSigners();
      const [, , bob] = users;

      // Deploy SignerHelper contract
      const signerHelperFactory = new SignerHelper__factory(governorWallet);
      const SignerHelper = await signerHelperFactory.deploy();
      // Create a hash in the same way as created by Signed contract
      const bobHash = await SignerHelper.createHash(
        'somedata',
        bob.address,
        WhitelistBondDepository.address,
        'supersecret'
      );

      // Set the secret on the Signed contract
      await WhitelistBondDepository.setSecret('supersecret');

      // 32 bytes of data in Uint8Array
      const messageHashBinary = ethers.utils.arrayify(bobHash);

      // To sign the 32 bytes of data, pass in the data
      signature = await governorWallet.signMessage(messageHashBinary);
    });

    it('should allow a deposit', async function () {
      const [, , bob] = users;

      await bob.WhitelistBondDepository.deposit(marketId, depositAmount, maxPrice, bob.address, bob.address, signature);
      const bobNotesIndexes = await WhitelistBondDepository.indexesFor(bob.address);

      expect(bobNotesIndexes.length).to.equal(1);
    });

    it('emits the price of theo per quote token', async function () {
      const [, , bob] = users;

      const depositAmount = ethers.utils.parseEther('25');
      const maxPrice = ethers.utils.parseEther('25');

      await expect(
        bob.WhitelistBondDepository.deposit(marketId, depositAmount, maxPrice, bob.address, bob.address, signature)
      )
        .to.emit(WhitelistBondDepository, 'Bond')
        .withArgs(marketId, depositAmount, expectedPrice);
    });

    it('adds the payout (due in THEO, 9 decimals) to the total amount of THEO sold by the market', async function () {
      const [, , bob] = users;

      const depositAmount = ethers.utils.parseEther('25');
      const maxPrice = ethers.utils.parseEther('25');

      await bob.WhitelistBondDepository.deposit(marketId, depositAmount, maxPrice, bob.address, bob.address, signature);
      const [, , , , , , sold] = await WhitelistBondDepository.markets(marketId);

      expect(Number(sold)).to.equal(expectedPayout);
    });

    it('adds the amount of quote tokens in the deposit to the total amount purchased by the market', async function () {
      const [, , bob] = users;

      const depositAmount = ethers.utils.parseEther('25');
      const maxPrice = ethers.utils.parseEther('25');

      await bob.WhitelistBondDepository.deposit(marketId, depositAmount, maxPrice, bob.address, bob.address, signature);
      const [, , , , , , , purchased] = await WhitelistBondDepository.markets(marketId);

      expect(Number(purchased)).to.equal(Number(depositAmount));
    });
  });

  describe('External view', function () {
    it('can give the current price of THEO per quote token', async function () {
      expect(await WhitelistBondDepository.calculatePrice(marketId)).to.equal(expectedPrice);
    });

    it('can give the payout expected in THEO (9 decimals) for a specified amount of quote tokens', async function () {
      const amount = ethers.utils.parseEther('100');
      const expectedPayoutQuote = Math.floor(Number(amount) / expectedPrice); // Amount of quote tokens divided by current price of THEO per quote token

      expect(await WhitelistBondDepository.payoutFor(amount, marketId)).to.equal(expectedPayoutQuote);
    });
  });

  describe.only('Close market', function () {
    beforeEach(async function () {
      const [governorWallet] = await ethers.getSigners();
      const [, , bob] = users;

      // Deploy SignerHelper contract
      const signerHelperFactory = new SignerHelper__factory(governorWallet);
      const SignerHelper = await signerHelperFactory.deploy();
      // Create a hash in the same way as created by Signed contract
      const bobHash = await SignerHelper.createHash(
        'somedata',
        bob.address,
        WhitelistBondDepository.address,
        'supersecret'
      );

      // Set the secret on the Signed contract
      await WhitelistBondDepository.setSecret('supersecret');

      // 32 bytes of data in Uint8Array
      const messageHashBinary = ethers.utils.arrayify(bobHash);

      // To sign the 32 bytes of data, pass in the data
      signature = await governorWallet.signMessage(messageHashBinary);
    });

    it('should allow a policy owner to close a market', async function () {
      let marketCap;
      [marketCap, , , , , ,] = await WhitelistBondDepository.markets(marketId);
      expect(Number(marketCap)).to.be.greaterThan(0);

      await WhitelistBondDepository.close(marketId);

      [marketCap, , , , , ,] = await WhitelistBondDepository.markets(marketId);
      expect(Number(marketCap)).to.equal(0);
      expect(await WhitelistBondDepository.isLive(marketId)).to.equal(false);
    });

    it('should revert if an address other than the policy owner makes a call to close a market', async function () {
      const [, , bob] = users;

      await expect(bob.WhitelistBondDepository.close(marketId)).to.be.revertedWith('UNAUTHORIZED');
    });

    it('should emit a Close Market event, with the id of the closed market, when closed', async function () {
      await expect(WhitelistBondDepository.close(marketId))
        .to.emit(WhitelistBondDepository, 'CloseMarket')
        .withArgs(marketId);
    });

    it('should not allow any new deposits after the market is closed', async function () {
      const [, , bob] = users;

      // Check the market allows a deposit before closing
      await expect(
        bob.WhitelistBondDepository.deposit(marketId, depositAmount, maxPrice, bob.address, bob.address, signature)
      ).to.not.be.reverted;

      await WhitelistBondDepository.close(marketId);

      await expect(
        bob.WhitelistBondDepository.deposit(marketId, depositAmount, maxPrice, bob.address, bob.address, signature)
      ).to.be.revertedWith('Depository: market concluded');
    });

    it('should close after the specified time-to-conclusion for the market has passed', async function () {
      const latestBlock = await ethers.provider.getBlock('latest');
      const newTimestampInSeconds = latestBlock.timestamp + timeToConclusion * 2;
      await ethers.provider.send('evm_mine', [newTimestampInSeconds]);

      expect(await WhitelistBondDepository.isLive(marketId)).to.equal(false);
    })
  });
});
