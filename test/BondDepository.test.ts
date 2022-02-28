import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts, network } from 'hardhat';
// import { TheopetraBondDepository } from '../../next-app/src/typechain';
import { setupUsers } from './utils';
import { CONTRACTS, MOCKS, MOCKSWITHARGS } from '../utils/constants';

const setup = deployments.createFixture(async () => {
  await deployments.fixture([
    CONTRACTS.bondDepo,
    CONTRACTS.authority,
    MOCKS.theoTokenMock,
    MOCKS.usdcTokenMock,
    MOCKSWITHARGS.treasuryMock,
    MOCKS.WETH9,
  ]);

  const { deployer: owner } = await getNamedAccounts();

  const contracts = {
    TheopetraAuthority: await ethers.getContract(CONTRACTS.authority),
    BondDepository: await ethers.getContract(CONTRACTS.bondDepo),
    TheopetraERC20Mock: await ethers.getContract(MOCKS.theoTokenMock),
    UsdcTokenMock: await ethers.getContract(MOCKS.usdcTokenMock),
    TreasuryMock: await ethers.getContract(MOCKSWITHARGS.treasuryMock),
    WETH9: await ethers.getContract(MOCKS.WETH9),
  };

  const users = await setupUsers(await getUnnamedAccounts(), contracts);

  return {
    ...contracts,
    users,
    owner,
  };
});

describe('Bond depository', function () {
  const bid = 0;
  const buffer = 2e5;
  const capacity = 10000e9;
  const capacityInQuote = false;
  const depositInterval = 60 * 60 * 4;
  const fixedTerm = true;
  const initialPrice = 400e9;
  const LARGE_APPROVAL = '100000000000000000000000000000000';
  const timeToConclusion = 60 * 60 * 24;
  const tuneInterval = 60 * 60;
  const vesting = 100;
  // Initial mint for Mock USDC
  const initialMint = '10000000000000000000000000';

  let block;
  let BondDepository: any;
  let conclusion: number;
  let TheopetraAuthority: any;
  let TheopetraERC20Mock: any;
  let TreasuryMock: any;
  let UsdcTokenMock: any;
  let users: any;
  let WETH9: any;

  let gOhmFactory: any;

  let gOHM: any;
  let staking: any;
  let treasury: any;

  beforeEach(async function () {
    ({ BondDepository, TheopetraAuthority, TheopetraERC20Mock, TreasuryMock, UsdcTokenMock, WETH9, users } =
      await setup());

    const [owner, , bob] = users;
    block = await ethers.provider.getBlock('latest');
    conclusion = block.timestamp + timeToConclusion;

    await UsdcTokenMock.mint(bob.address, initialMint);

    await TheopetraAuthority.pushVault(TreasuryMock.address, true);

    await TheopetraERC20Mock.mint(owner.address, '10000000000000'); // Set to be same as return value in Treasury Mock for baseSupply

    await bob.UsdcTokenMock.approve(BondDepository.address, LARGE_APPROVAL);
    await bob.WETH9.approve(BondDepository.address, LARGE_APPROVAL);

    await BondDepository.create(
      UsdcTokenMock.address,
      [capacity, initialPrice, buffer],
      [capacityInQuote, fixedTerm],
      [vesting, conclusion],
      [depositInterval, tuneInterval]
    );
    expect(await BondDepository.isLive(bid)).to.equal(true);
  });

  describe('Deployment', function () {
    it('can be deployed', async function () {
      await setup();
    });
  });

  describe('Create market', function () {
    it('should allow the policy owner to create a market', async function () {
      expect(await BondDepository.isLive(bid)).to.equal(true);
    });

    it('should allow a market to be created with wETH', async function () {
      ({ BondDepository, WETH9 } = await setup());

      await BondDepository.create(
        WETH9.address,
        [capacity, initialPrice, buffer],
        [capacityInQuote, fixedTerm],
        [vesting, conclusion],
        [depositInterval, tuneInterval]
      );
    });

    it('should allow multiple markets to be created and be live', async function () {
      await BondDepository.create(
        WETH9.address,
        [capacity, initialPrice, buffer],
        [capacityInQuote, fixedTerm],
        [vesting, conclusion],
        [depositInterval, tuneInterval]
      );
      expect(await BondDepository.isLive(bid)).to.equal(true);
      expect(await BondDepository.isLive(1)).to.equal(true);
      expect((await BondDepository.liveMarkets()).length).to.equal(2);
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

    it('should set max payout to correct % of capacity', async function () {
      const [, , , , maxPayout, ,] = await BondDepository.markets(bid);
      const upperBound = (capacity * 1.0033) / 6;
      const lowerBound = (capacity * 0.9967) / 6;
      expect(Number(maxPayout)).to.be.greaterThan(lowerBound);
      expect(Number(maxPayout)).to.be.lessThan(upperBound);
    });

    it('should return the ids of all markets', async function () {
      await BondDepository.create(
        WETH9.address,
        [capacity, initialPrice, buffer],
        [capacityInQuote, fixedTerm],
        [vesting, conclusion],
        [depositInterval, tuneInterval]
      );
      const [firstMarketId, secondMarketId] = await BondDepository.liveMarkets();
      expect(Number(firstMarketId)).to.equal(0);
      expect(Number(secondMarketId)).to.equal(1);
    });

    it('should return the market id for a live market of a given quote token', async function () {
      await BondDepository.create(
        WETH9.address,
        [capacity, initialPrice, buffer],
        [capacityInQuote, fixedTerm],
        [vesting, conclusion],
        [depositInterval, tuneInterval]
      );

      const [idMarket1] = await BondDepository.liveMarketsFor(UsdcTokenMock.address);
      expect(Number(idMarket1)).to.equal(bid);

      const [idMarket2] = await BondDepository.liveMarketsFor(WETH9.address);
      expect(Number(idMarket2)).to.equal(1);
    });

    it('should start with price at the initial price', async function () {
      const lowerBound = initialPrice * 0.9999;
      expect(Number(await BondDepository.marketPrice(bid))).to.be.greaterThan(lowerBound);
    });

    it('should give accurate payout for price', async function () {
      const price = await BondDepository.marketPrice(bid);
      const amount = 100000000000000;
      const expectedPayout = amount / price;
      const lowerBound = expectedPayout * 0.9999;

      expect(Number(await BondDepository.payoutFor(amount, 0))).to.be.greaterThan(lowerBound);
    });
  });

  describe('Deposit', function () {
    it('should allow a deposit', async () => {
      const [, , bob, carol] = users;
      const amount = '10000';

      await bob.BondDepository.deposit(bid, amount, initialPrice, bob.address, carol.address);
      expect(Array(await BondDepository.indexesFor(bob.address)).length).to.equal(1);
    });

    it('should revert if a user attempts to deposit an amount greater than max payout', async () => {
      const [, , bob, carol] = users;
      const amount = '6700000000000000000000000';
      await expect(
        bob.BondDepository.deposit(bid, amount, initialPrice, bob.address, carol.address)
      ).to.be.revertedWith('Depository: max size exceeded');
    });

    it('should decay debt', async function () {
      const [, , bob, carol] = users;
      const [, , , totalDebt, , ,] = await BondDepository.markets(0);

      await network.provider.send('evm_increaseTime', [100]);
      bob.BondDepository.deposit(bid, 10000, initialPrice, bob.address, carol.address);

      const [, , , newTotalDebt, , ,] = await BondDepository.markets(0);
      expect(Number(totalDebt)).to.be.greaterThan(Number(newTotalDebt));
    });

    it.only('should mint a payout that is added to the balance of the bond depo', async function () {
      const [, , bob, carol] = users;
      const amount = "10000000000000000000000";

      const initialBondDepoTheoBalance = await TheopetraERC20Mock.balanceOf(BondDepository.address)
      await bob.BondDepository.deposit(bid, amount, initialPrice, bob.address, carol.address);
      
      const newBondDepoTHEOBalance = await TheopetraERC20Mock.balanceOf(BondDepository.address);

      expect(Number(initialBondDepoTheoBalance)).to.be.lessThan(Number(newBondDepoTHEOBalance));
    })
  });

  describe('Close market', function () {
    it('should allow a policy owner to close a market', async () => {
      let marketCap;
      [marketCap, , , , , ,] = await BondDepository.markets(bid);
      expect(Number(marketCap)).to.be.greaterThan(0);

      await BondDepository.close(bid);

      [marketCap, , , , , ,] = await BondDepository.markets(bid);
      expect(Number(marketCap)).to.equal(0);
    });

    it('should revert if an address other than the policy owner makes a call to close a market', async () => {
      const [, , bob] = users;
      const [marketCap, , , , , ,] = await BondDepository.markets(bid);
      expect(Number(marketCap)).to.be.greaterThan(0);

      await expect(bob.BondDepository.close(bid)).to.be.revertedWith('UNAUTHORIZED');
    });

    it('should conclude in the correct time', async function () {
      const [, , , concludes] = await BondDepository.terms(bid);
      expect(concludes).to.equal(conclusion);
      const [, , length, , , ,] = await BondDepository.metadata(bid);
      // timestamps are a bit inaccurate with tests
      const upperBound = timeToConclusion * 1.0033;
      const lowerBound = timeToConclusion * 0.9967;
      expect(Number(length)).to.be.greaterThan(lowerBound);
      expect(Number(length)).to.be.lessThan(upperBound);
    });

    it('should update live markets after a market is closed', async function () {
      await BondDepository.create(
        WETH9.address,
        [capacity, initialPrice, buffer],
        [capacityInQuote, fixedTerm],
        [vesting, conclusion],
        [depositInterval, tuneInterval]
      );

      await BondDepository.close(0);
      const [firstMarketId] = await BondDepository.liveMarkets();
      expect(Number(firstMarketId)).to.equal(1);
    });
  });

  describe('Redeem', function () {
    it('should not redeem before vested', async function () {
      const [, , bob, carol] = users;
      const amount = "10000000000000000000000"; // 10,000

      const balance = await TheopetraERC20Mock.balanceOf(bob.address);
      await bob.BondDepository.deposit(bid, amount, initialPrice, bob.address, carol.address);
      expect(Array(await BondDepository.indexesFor(bob.address)).length).to.equal(1);
      const [, matured_] = await BondDepository.pendingFor(bob.address, 0);

      expect(matured_).to.equal(false);

      await bob.BondDepository.redeemAll(bob.address, true);
      expect(await TheopetraERC20Mock.balanceOf(bob.address)).to.equal(balance);
    });

    it('should mature after vesting time', async function () {
      const [, , bob, carol] = users;
      const amount = '10000000000000000000000';

      await bob.BondDepository.deposit(bid, amount, initialPrice, bob.address, carol.address);
      expect(Array(await BondDepository.indexesFor(bob.address)).length).to.equal(1);

      const latestBlock = await ethers.provider.getBlock('latest');
      const newTimestampInSeconds = latestBlock.timestamp + 1000;
      await ethers.provider.send("evm_mine", [newTimestampInSeconds]);

      const [, matured_] = await BondDepository.pendingFor(bob.address, 0);

      expect(matured_).to.equal(true);
    });

    it.skip('should allow a deposit to be redeemed', async () => {
      const [, , bob, carol] = users;
      const amount = '10000000000000000000000';

      // await bob.BondDepository.callStatic.deposit(bid, amount, initialPrice, bob.address, carol.address);
      await bob.BondDepository.deposit(bid, amount, initialPrice, bob.address, carol.address);
      expect(Array(await BondDepository.indexesFor(bob.address)).length).to.equal(1);

      const latestBlock = await ethers.provider.getBlock('latest');
      const newTimestampInSeconds = latestBlock.timestamp + 1000;
      await ethers.provider.send("evm_mine", [newTimestampInSeconds]);

      await bob.BondDepository.redeemAll(bob.address, true);


    });
  });
});
