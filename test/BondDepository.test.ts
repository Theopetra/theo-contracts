import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts, network } from 'hardhat';
import { setupUsers, performanceUpdate, waitFor, moveTimeForward } from './utils';
import { getContracts } from '../utils/helpers';
import { CONTRACTS, TESTWITHMOCKS } from '../utils/constants';
import {
  BondingCalculatorMock,
  StakingMock,
  TheopetraAuthority,
  TheopetraBondDepository,
  TheopetraStaking,
  UsdcERC20Mock,
  WETH9,
  YieldReporterMock,
  TheopetraYieldReporter,
} from '../typechain-types';

const setup = deployments.createFixture(async function () {
  await deployments.fixture();
  const { deployer: owner } = await getNamedAccounts();

  const contracts = await getContracts(CONTRACTS.bondDepo);

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
  const capacity = '10000000000000000'; // 1e16
  const capacityInQuote = false;
  const depositAmount = '100000000'; // 1e8, equivalent to 100 USDC (6 decimals for USDC)
  const depositInterval = 60 * 60 * 24 * 30;
  const fixedTerm = true;
  const initialPrice = 400e9;
  const LARGE_APPROVAL = '100000000000000000000000000000000';
  const timeToConclusion = 60 * 60 * 24 * 180; // seconds in 180 days
  const tuneInterval = 60 * 60;
  const vesting = 60 * 60 * 24 * 14; // seconds in 14 days
  // Initial mint for Mock USDC
  const initialMint = '10000000000000000000000000';
  const bondRateFixed = 10_000_000; // 1% in decimal form (i.e. 0.01 with 9 decimals)
  const maxBondRateVariable = 40_000_000; // 4% in decimal form (i.e. 0.04 with 9 decimals)
  const discountRateBond = 10_000_000; // 1% in decimal form (i.e. 0.01 with 9 decimals)
  const discountRateYield = 20_000_000; // 2% in decimal form (i.e. 0.02 with 9 decimals)

  let block: any;
  let BondDepository: TheopetraBondDepository;
  let BondingCalculatorMock: BondingCalculatorMock;
  let conclusion: number;
  let Staking: any;
  let sTheo: any;
  let TheopetraAuthority: TheopetraAuthority;
  let TheopetraERC20Token: any;
  let Treasury: any;
  let UsdcTokenMock: UsdcERC20Mock;
  let users: any;
  let WETH9: WETH9;
  let YieldReporter: TheopetraYieldReporter | YieldReporterMock;
  const autoStake = true;

  async function expectedBondRateVariable(marketId: number) {
    const [, , , brFixed, , Drb, Dyb] = await BondDepository.terms(marketId);

    const deltaTokenPrice = await Treasury.deltaTokenPrice();
    const deltaTreasuryYield = await Treasury.deltaTreasuryYield();
    return (
      Number(brFixed) +
      (Number(Drb) * Number(deltaTokenPrice)) / 10 ** 9 +
      (Number(Dyb) * Number(deltaTreasuryYield)) / 10 ** 9
    );
  }

  beforeEach(async function () {
    ({
      BondDepository,
      BondingCalculatorMock,
      Staking,
      sTheo,
      TheopetraAuthority,
      TheopetraERC20Token,
      Treasury,
      UsdcTokenMock,
      users,
      WETH9,
      YieldReporter,
    } = await setup());

    const [, , bob] = users;
    block = await ethers.provider.getBlock('latest');
    conclusion = block.timestamp + timeToConclusion;

    await UsdcTokenMock.mint(bob.address, initialMint);

    // Setup to mint initial amount of THEO and (with mocking only) sTHEO
    const [, treasurySigner] = await ethers.getSigners();
    await TheopetraAuthority.pushVault(treasurySigner.address, true); // Use a valid signer for Vault
    if (process.env.NODE_ENV === TESTWITHMOCKS) {
      // Only call this if using mock sTheo, as only the mock has a mint function (sTheo itself uses `initialize` instead)
      await sTheo.mint(BondDepository.address, '1000000000000000000000');

      await TheopetraERC20Token.connect(treasurySigner).mint(BondDepository.address, '10000000000000000'); // 1e16 Set to be same as return value in Treasury Mock for baseSupply
    } else {
      await TheopetraERC20Token.connect(treasurySigner).mint(BondDepository.address, '1000000000000000000000000'); // 1e24 Set high to allow for tests with very large deposits
    }
    await TheopetraAuthority.pushVault(Treasury.address, true); // Restore Treasury contract as Vault

    // Update bob's balance to allow very large deposits
    await network.provider.send('hardhat_setBalance', [
      bob.address,
      '0x52B7D2DCC80CD2E4000000', // 1e26
    ]);

    // Deposit / mint quote tokens and approve transfer for the Bond Depository, to allow deposits
    await bob.WETH9.deposit({ value: ethers.utils.parseEther('10000') });
    await bob.UsdcTokenMock.approve(BondDepository.address, LARGE_APPROVAL);
    await bob.WETH9.approve(BondDepository.address, LARGE_APPROVAL);

    await BondDepository.create(
      UsdcTokenMock.address,
      [capacity, initialPrice, buffer],
      [capacityInQuote, fixedTerm],
      [vesting, conclusion],
      [bondRateFixed, maxBondRateVariable, discountRateBond, discountRateYield],
      [depositInterval, tuneInterval]
    );
    expect(await BondDepository.isLive(bid)).to.equal(true);

    // Setup for successful calls to `marketPrice` (during `deposit`) when test use wired-up contracts
    if (process.env.NODE_ENV !== TESTWITHMOCKS) {
      await performanceUpdate(Treasury, YieldReporter, BondingCalculatorMock.address);
    }
  });

  describe('Deployment', function () {
    it('can be deployed', async function () {
      await setup();
    });

    it('bulk-approves an amount of 1e45 for the staking contract to spend', async function () {
      const stakingAllowance = await TheopetraERC20Token.allowance(BondDepository.address, Staking.address);
      const spendAmount = '1000000000000000000000000000000000000000000000'; // 1e45
      expect(stakingAllowance).to.equal(spendAmount);
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
        [bondRateFixed, maxBondRateVariable, discountRateBond, discountRateYield],
        [depositInterval, tuneInterval]
      );
    });

    it('should allow multiple markets to be created and be live', async function () {
      await BondDepository.create(
        WETH9.address,
        [capacity, initialPrice, buffer],
        [capacityInQuote, fixedTerm],
        [vesting, conclusion],
        [bondRateFixed, maxBondRateVariable, discountRateBond, discountRateYield],
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
          [bondRateFixed, maxBondRateVariable, discountRateBond, discountRateYield],
          [depositInterval, tuneInterval]
        )
      ).to.be.revertedWith('UNAUTHORIZED');
    });

    it('should store the vesting length in the bond terms', async function () {
      const [, vestingLength] = await BondDepository.terms(bid);

      expect(vestingLength).to.equal(vesting);
    });

    it('can be created with a vesting length of 90 days', async function () {
      const longVesting = 60 * 60 * 24 * 90;

      await BondDepository.create(
        UsdcTokenMock.address,
        [capacity, initialPrice, buffer],
        [capacityInQuote, fixedTerm],
        [longVesting, conclusion],
        [bondRateFixed, maxBondRateVariable, discountRateBond, discountRateYield],
        [depositInterval, tuneInterval]
      );

      const [, vestingLength] = await BondDepository.terms(1);

      expect(vestingLength).to.equal(longVesting);
    });

    it('can be created with a vesting length of 30 days', async function () {
      const longVesting = 60 * 60 * 24 * 30;

      await BondDepository.create(
        UsdcTokenMock.address,
        [capacity, initialPrice, buffer],
        [capacityInQuote, fixedTerm],
        [longVesting, conclusion],
        [bondRateFixed, maxBondRateVariable, discountRateBond, discountRateYield],
        [depositInterval, tuneInterval]
      );

      const [, vestingLength] = await BondDepository.terms(1);

      expect(vestingLength).to.equal(longVesting);
    });

    it('can be created with a vesting length that extends beyond the market conclusion time', async function () {
      const longVesting = 60 * 60 * 24 * 90; // 90 days vesting time
      const shorterConclusion = block.timestamp + 60 * 60 * 24 * 30; // 30 days to market conclusion

      await BondDepository.create(
        UsdcTokenMock.address,
        [capacity, initialPrice, buffer],
        [capacityInQuote, fixedTerm],
        [longVesting, shorterConclusion],
        [bondRateFixed, maxBondRateVariable, discountRateBond, discountRateYield],
        [depositInterval, tuneInterval]
      );

      const [, vestingLength] = await BondDepository.terms(1);

      expect(vestingLength).to.equal(longVesting);
    });

    it('should store the correct market terms', async function () {
      const [, vestingLength, marketConclusion, brFixed, maxBrVariable, Drb, Dyb, maxDebt] = await BondDepository.terms(
        bid
      );

      expect(vestingLength).to.equal(vesting);
      expect(marketConclusion).to.equal(conclusion);
      expect(brFixed).to.equal(bondRateFixed);
      expect(maxBrVariable).to.equal(maxBondRateVariable);
      expect(Drb).to.equal(discountRateBond);
      expect(Dyb).to.equal(discountRateYield);

      const expectedMaxDebt = Number(capacity) + (Number(capacity) * buffer) / 10 ** 5;
      expect(Number(maxDebt)).to.equal(expectedMaxDebt);
    });

    it('should set max payout to correct % of capacity', async function () {
      const [, , , , , , maxPayout] = await BondDepository.markets(bid);
      const [, , secondsToConclusion, depositInterval] = await BondDepository.metadata(bid);
      const upperBound = (Number(capacity) * Number(depositInterval) * 1.0033) / secondsToConclusion;
      const lowerBound = (Number(capacity) * Number(depositInterval) * 0.9967) / secondsToConclusion;
      expect(Number(maxPayout)).to.be.greaterThan(lowerBound);
      expect(Number(maxPayout)).to.be.lessThan(upperBound);
    });

    it('should return the ids of all markets', async function () {
      await BondDepository.create(
        WETH9.address,
        [capacity, initialPrice, buffer],
        [capacityInQuote, fixedTerm],
        [vesting, conclusion],
        [bondRateFixed, maxBondRateVariable, discountRateBond, discountRateYield],
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
        [bondRateFixed, maxBondRateVariable, discountRateBond, discountRateYield],
        [depositInterval, tuneInterval]
      );

      const [idMarket1] = await BondDepository.liveMarketsFor(UsdcTokenMock.address);
      expect(Number(idMarket1)).to.equal(bid);

      const [idMarket2] = await BondDepository.liveMarketsFor(WETH9.address);
      expect(Number(idMarket2)).to.equal(1);
    });
  });

  describe('Deposit', function () {
    beforeEach(async function () {
      // Set the address of the bonding calculator
      await Treasury.setTheoBondingCalculator(BondingCalculatorMock.address);
    });

    it('should allow a deposit', async function () {
      const [, , bob, carol] = users;
      await bob.BondDepository.deposit(bid, depositAmount, initialPrice, bob.address, carol.address, autoStake);
      const bobNotesIndexes = await BondDepository.indexesFor(bob.address);

      expect(bobNotesIndexes.length).to.equal(1);
    });

    it('can allow a large deposit (by using a large deposit interval)', async function () {
      const [, , bob, carol] = users;
      const largeDepositAmount = '1000000000000000000'; // 1 ETH (1e18)
      const largeDepositInterval = 60 * 60 * 24 * 180; // Set to match time remaining until market conclusion
      await BondDepository.create(
        WETH9.address,
        [capacity, initialPrice, buffer],
        [capacityInQuote, fixedTerm],
        [vesting, conclusion],
        [bondRateFixed, maxBondRateVariable, discountRateBond, discountRateYield],
        [largeDepositInterval, tuneInterval]
      );

      await bob.BondDepository.deposit(1, largeDepositAmount, initialPrice, bob.address, carol.address, autoStake);
      const bobNotesIndexes = await BondDepository.indexesFor(bob.address);

      expect(bobNotesIndexes.length).to.equal(1);
    });

    it('can allow a large deposit (using a combination of large capacity and long deposit interval)', async function () {
      const [, , bob, carol] = users;
      const largeDepositAmount = '100000000000000000000'; // 100 ETH (1e20)
      const largeDepositInterval = 60 * 60 * 24 * 180; // Set to match time remaining until market conclusion
      const largeCapacity = '10000000000000000'; // 1e16
      await BondDepository.create(
        WETH9.address,
        [largeCapacity, initialPrice, buffer],
        [capacityInQuote, fixedTerm],
        [vesting, conclusion],
        [bondRateFixed, maxBondRateVariable, discountRateBond, discountRateYield],
        [largeDepositInterval, tuneInterval]
      );

      await bob.BondDepository.deposit(1, largeDepositAmount, initialPrice, bob.address, carol.address, autoStake);
      const bobNotesIndexes = await BondDepository.indexesFor(bob.address);

      expect(bobNotesIndexes.length).to.equal(1);
    });

    it.skip('can allow a very large deposit into a WETH market (using a combination of large capacity and long deposit interval)', async function () {
      const [, , bob, carol] = users;
      const largeDepositAmount = ethers.utils.parseEther('10000');
      const largeDepositInterval = 60 * 60 * 24 * 180; // Set to match time remaining until market conclusion
      const largeCapacity = '10000000000000000000'; // 1e19
      await BondDepository.create(
        WETH9.address,
        [largeCapacity, initialPrice, buffer],
        [capacityInQuote, fixedTerm],
        [vesting, conclusion],
        [bondRateFixed, maxBondRateVariable, discountRateBond, discountRateYield],
        [largeDepositInterval, tuneInterval]
      );

      await bob.BondDepository.deposit(1, largeDepositAmount, initialPrice, bob.address, carol.address, autoStake);
      const bobNotesIndexes = await BondDepository.indexesFor(bob.address);

      expect(bobNotesIndexes.length).to.equal(1);
    });

    it.skip('can allow a very large deposit into a USDC market (using a combination of large capacity and long deposit interval)', async function () {
      const [, , bob, carol] = users;
      const largeDepositAmount = '30000000000000'; // 30m USDC
      const largeDepositInterval = 60 * 60 * 24 * 180; // Set to match time remaining until market conclusion
      const largeCapacity = '10000000000000000000000'; // 1e22
      await BondDepository.create(
        UsdcTokenMock.address,
        [largeCapacity, initialPrice, buffer],
        [capacityInQuote, fixedTerm],
        [vesting, conclusion],
        [bondRateFixed, maxBondRateVariable, discountRateBond, discountRateYield],
        [largeDepositInterval, tuneInterval]
      );

      await bob.BondDepository.deposit(1, largeDepositAmount, initialPrice, bob.address, carol.address, autoStake);
      const bobNotesIndexes = await BondDepository.indexesFor(bob.address);

      expect(bobNotesIndexes.length).to.equal(1);
    });

    it.skip('can allow a very large market capacity, for multiple very large deposits', async function () {
      const [, , bob, carol] = users;
      const largeDepositAmount = '30000000000000'; // 30m USDC
      const largeDepositInterval = 60 * 60 * 24 * 180; // Set to match time remaining until market conclusion
      const largeCapacity = '10000000000000000000000000000000000000000000000';
      await BondDepository.create(
        UsdcTokenMock.address,
        [largeCapacity, initialPrice, buffer],
        [capacityInQuote, fixedTerm],
        [vesting, conclusion],
        [bondRateFixed, maxBondRateVariable, discountRateBond, discountRateYield],
        [largeDepositInterval, tuneInterval]
      );

      const [, , , , , totalDebt] = await BondDepository.markets(1);
      const [, , , , , , , initialMaxDebt] = await BondDepository.terms(1);
      expect(Number(initialMaxDebt)).to.be.greaterThan(Number(totalDebt)); // Helps check that overflow has not occured when using very large market capacity

      await bob.BondDepository.deposit(1, largeDepositAmount, initialPrice, bob.address, carol.address, autoStake);

      const anotherLargeDepositAmount = '35000000000000'; // 35m USDC
      await bob.BondDepository.deposit(
        1,
        anotherLargeDepositAmount,
        initialPrice,
        bob.address,
        carol.address,
        autoStake
      );
      const bobNotesIndexes = await BondDepository.indexesFor(bob.address);

      expect(bobNotesIndexes.length).to.equal(2);
    });

    it('updates the purchased and sold amounts correctly', async function () {
      const [, , bob, carol] = users;

      const [, , , sold, purchased] = await BondDepository.markets(0);
      expect(sold).to.equal(0);
      expect(purchased).to.equal(0);

      await bob.BondDepository.deposit(bid, depositAmount, initialPrice, bob.address, carol.address, autoStake);

      const [, , , newSold, newPurchased] = await BondDepository.markets(0);
      const [payout_] = await BondDepository.pendingFor(bob.address, 0);
      expect(newSold).to.equal(payout_);
      expect(newPurchased).to.equal(depositAmount);
    });

    it.skip('should protect the user against price changes after entering the mempool', async function () {
      const [, , bob, carol] = users;

      await bob.BondDepository.deposit(bid, depositAmount, initialPrice, bob.address, carol.address, autoStake);
      await expect(
        bob.BondDepository.deposit(bid, depositAmount, initialPrice, bob.address, carol.address, autoStake)
      ).to.be.revertedWith('Depository: more than max price');
    });

    it('should revert if a user attempts to deposit an amount greater than max payout', async function () {
      const [, , bob, carol] = users;
      const amount = '6700000000000000000000000';
      await expect(
        bob.BondDepository.deposit(bid, amount, initialPrice, bob.address, carol.address, autoStake)
      ).to.be.revertedWith('Depository: max size exceeded');
    });

    it('should revert if a user attempts to deposit an amount greater than max payout after several previous successful deposits', async function () {
      const [, , bob, carol] = users;
      const [, , , , , , initialMaxPayout] = await BondDepository.markets(0);

      await bob.BondDepository.deposit(bid, 10000, initialPrice, bob.address, carol.address, autoStake);
      await bob.BondDepository.deposit(bid, 10000, initialPrice, bob.address, carol.address, autoStake);
      await bob.BondDepository.deposit(bid, 10000, initialPrice, bob.address, carol.address, autoStake);

      const bobNotesIndexes = await BondDepository.indexesFor(bob.address);

      expect(bobNotesIndexes.length).to.equal(3);

      const amount = '6700000000000000000000000';
      await expect(
        bob.BondDepository.deposit(bid, amount, initialPrice, bob.address, carol.address, autoStake)
      ).to.be.revertedWith('Depository: max size exceeded');
    });

    it('should decay debt over time', async function () {
      const [, , bob, carol] = users;
      const [, , , , , totalDebt] = await BondDepository.markets(0);

      await network.provider.send('evm_increaseTime', [100]);
      await bob.BondDepository.deposit(bid, 10000, initialPrice, bob.address, carol.address, autoStake);

      const [, , , , , newTotalDebt] = await BondDepository.markets(0);
      expect(Number(totalDebt)).to.be.greaterThan(Number(newTotalDebt));
    });

    it('will close the market if the total debt is greater than the max debt allowed for the market', async function () {
      const [, , bob, carol] = users;

      const largeDepositAmount = ethers.utils.parseEther('1');
      const largeDepositInterval = 60 * 60 * 24 * 180; // Set to match time remaining until market conclusion
      const largeCapacity = '30000000000000000'; // 3e16, for the totalDebt to be very close to maxDebt at market creation
      const lowDebtBuffer = 1; // set low, to result in a maxDebt very close to total debt at market creation
      await BondDepository.create(
        WETH9.address,
        [largeCapacity, initialPrice, lowDebtBuffer],
        [capacityInQuote, fixedTerm],
        [vesting, conclusion],
        [bondRateFixed, maxBondRateVariable, discountRateBond, discountRateYield],
        [largeDepositInterval, tuneInterval]
      );

      const { events } = await waitFor(
        bob.BondDepository.deposit(1, largeDepositAmount, initialPrice, bob.address, carol.address, autoStake)
      );
      const marketClosed = events.find((eventObj: any) => {
        return eventObj.event === 'CloseMarket';
      });

      expect(marketClosed).not.to.be.undefined;
      expect(marketClosed.event).to.equal('CloseMarket'); // A close market event is emitted
      const [, , , , , newTotalDebt] = await BondDepository.markets(1);
      const [, , , , , , , newMaxDebt] = await BondDepository.terms(1);

      expect(Number(newMaxDebt)).to.be.lessThan(Number(newTotalDebt));

      const [newMarketCapacity] = await BondDepository.markets(1);
      expect(Number(newMarketCapacity)).to.equal(0); // Capacity of the market is set to zero

      const [payout_] = await BondDepository.pendingFor(bob.address, 0);
      expect(Number(payout_)).to.be.greaterThan(0); // Bob's first deposit was successful and Bob therefore has a payout due

      // No further deposit is allowed, as market capacity is now at zero
      await expect(
        waitFor(bob.BondDepository.deposit(1, largeDepositAmount, initialPrice, bob.address, carol.address, autoStake))
      ).to.be.reverted;
    });

    it('should mint the payout in THEO', async function () {
      const [, , bob, carol] = users;

      const initialTotalTheoSupply = await TheopetraERC20Token.totalSupply();

      await bob.BondDepository.deposit(bid, depositAmount, initialPrice, bob.address, carol.address, autoStake);

      const newTotalTheoSupply = await TheopetraERC20Token.totalSupply();
      const [payout_] = await BondDepository.pendingFor(bob.address, 0);

      expect(newTotalTheoSupply.sub(initialTotalTheoSupply)).to.equal(payout_);
    });

    it('should result in an emitted event by the Treasury, when THEO is minted', async function () {
      const [, , bob] = users;

      const { events } = await waitFor(
        bob.BondDepository.deposit(bid, depositAmount, initialPrice, bob.address, bob.address, autoStake)
      );
      const [payout_] = await BondDepository.pendingFor(bob.address, 0);
      expect(events).to.have.length(process.env.NODE_ENV === TESTWITHMOCKS ? 7 : 10);

      const receipt = await ethers.provider.getTransactionReceipt(
        events[process.env.NODE_ENV === TESTWITHMOCKS ? 6 : 9]?.transactionHash
      );
      const abi = ['event Minted(address indexed caller, address indexed recipient, uint256 amount)'];

      const iface = new ethers.utils.Interface(abi);

      // filter for the log specific to the Treasury
      const treasuryLog = receipt?.logs?.filter((log) => {
        return log.address === Treasury.address;
      });
      expect(treasuryLog.length).to.equal(1);
      const log = iface.parseLog(treasuryLog[0]);
      const { caller, recipient, amount } = log.args;

      expect(Number(amount)).to.equal(Number(payout_));
      expect(caller).to.equal(BondDepository.address);
      expect(recipient).to.equal(BondDepository.address);
    });

    it('should stake the payout', async function () {
      const [, , bob, carol] = users;

      const initialStakingTheoBalance = await TheopetraERC20Token.balanceOf(Staking.address);

      await bob.BondDepository.deposit(bid, depositAmount, initialPrice, bob.address, carol.address, autoStake);

      const newStakingTHEOBalance = await TheopetraERC20Token.balanceOf(Staking.address);
      expect(Number(initialStakingTheoBalance)).to.be.lessThan(Number(newStakingTHEOBalance));
    });

    it('should emit a Bond event containing bond market id, amount and price', async function () {
      const [, , bob] = users;

      const price = await BondDepository.marketPrice(bid);

      await expect(bob.BondDepository.deposit(bid, depositAmount, initialPrice, bob.address, bob.address, autoStake))
        .to.emit(BondDepository, 'Bond')
        .withArgs(bid, depositAmount, price);
    });

    it('should adjust the maxPayout for the market', async function () {
      const [, , bob, carol] = users;
      const [, , , , , , initialMaxPayout] = await BondDepository.markets(0);

      await bob.BondDepository.deposit(bid, 10000, initialPrice, bob.address, carol.address, autoStake);
      await network.provider.send('evm_increaseTime', [tuneInterval * 2]); // move time forward, beyond the tuneInterval, to ensure tuning occurs, which will change maxPayout
      await bob.BondDepository.deposit(bid, 10000, initialPrice, bob.address, carol.address, autoStake);
      await network.provider.send('evm_increaseTime', [tuneInterval * 2]); // move time forward, beyond the tuneInterval, to ensure tuning occurs, which will change maxPayout
      await bob.BondDepository.deposit(bid, 10000, initialPrice, bob.address, carol.address, autoStake);

      const [, , , , , , newMaxPayout] = await BondDepository.markets(0);
      expect(newMaxPayout).not.to.equal(initialMaxPayout);
    });
  });

  describe('Close market', function () {
    it('should allow a policy owner to close a market', async function () {
      let marketCap;
      [marketCap, , , , , ,] = await BondDepository.markets(bid);
      expect(Number(marketCap)).to.be.greaterThan(0);

      await BondDepository.close(bid);

      [marketCap, , , , , ,] = await BondDepository.markets(bid);
      expect(Number(marketCap)).to.equal(0);
    });

    it('should revert if an address other than the policy owner makes a call to close a market', async function () {
      const [, , bob] = users;
      const [marketCap, , , , , ,] = await BondDepository.markets(bid);
      expect(Number(marketCap)).to.be.greaterThan(0);

      await expect(bob.BondDepository.close(bid)).to.be.revertedWith('UNAUTHORIZED');
    });

    it('should conclude in the correct time', async function () {
      const [, , concludes] = await BondDepository.terms(bid);
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
        [bondRateFixed, maxBondRateVariable, discountRateBond, discountRateYield],
        [depositInterval, tuneInterval]
      );

      await BondDepository.close(0);
      const [firstMarketId] = await BondDepository.liveMarkets();
      expect(Number(firstMarketId)).to.equal(1);
    });
  });

  describe('pendingFor', function () {
    beforeEach(async function () {
      // Set the address of the bonding calculator
      await Treasury.setTheoBondingCalculator(BondingCalculatorMock.address);
    });

    it('should show the Note as being not-yet-matured before the vesting time has passed', async function () {
      const [, , bob, carol] = users;

      await bob.BondDepository.deposit(bid, depositAmount, initialPrice, bob.address, carol.address, autoStake);

      const latestBlock = await ethers.provider.getBlock('latest');
      const newTimestampInSeconds = latestBlock.timestamp + vesting / 2;
      await ethers.provider.send('evm_mine', [newTimestampInSeconds]);

      const [, , , , matured_] = await BondDepository.pendingFor(bob.address, 0);

      expect(matured_).to.equal(false);
    });

    it('should show the Note as being matured after the vesting time has passed', async function () {
      const [, , bob, carol] = users;

      await bob.BondDepository.deposit(bid, depositAmount, initialPrice, bob.address, carol.address, autoStake);
      const bobNotesIndexes = await BondDepository.indexesFor(bob.address);

      expect(bobNotesIndexes.length).to.equal(1);

      const latestBlock = await ethers.provider.getBlock('latest');
      const newTimestampInSeconds = latestBlock.timestamp + vesting * 10;
      await ethers.provider.send('evm_mine', [newTimestampInSeconds]);

      const [, , , , matured_] = await BondDepository.pendingFor(bob.address, 0);

      expect(matured_).to.equal(true);
    });

    it('should correctly show maturity of multiple notes', async function () {
      const [, , bob, carol] = users;

      // First deposit
      await bob.BondDepository.deposit(bid, depositAmount, initialPrice, bob.address, carol.address, autoStake);

      // Move time forward
      const latestBlock = await ethers.provider.getBlock('latest');
      const newTimestampInSeconds = latestBlock.timestamp + vesting * 10;
      await ethers.provider.send('evm_mine', [newTimestampInSeconds]);

      // Second deposit
      await bob.BondDepository.deposit(bid, depositAmount, initialPrice * 1.01, bob.address, carol.address, autoStake);

      const [, , , , firstMatured_] = await BondDepository.pendingFor(bob.address, 0);
      const [, , , , secondMatured_] = await BondDepository.pendingFor(bob.address, 1);

      expect(firstMatured_).to.equal(true);
      expect(secondMatured_).to.equal(false);
    });
  });

  describe('Redeem', function () {
    beforeEach(async function () {
      // Set the address of the bonding calculator
      await Treasury.setTheoBondingCalculator(BondingCalculatorMock.address);
    });

    it('should not be immediately redeemable (before the vesting time has passed)', async function () {
      const [, , bob, carol] = users;
      const autoStake = true;
      const balance = await TheopetraERC20Token.balanceOf(bob.address);
      await bob.BondDepository.deposit(bid, depositAmount, initialPrice, bob.address, carol.address, autoStake);
      const bobNotesIndexes = await BondDepository.indexesFor(bob.address);

      expect(bobNotesIndexes.length).to.equal(1);
      const [, , , , matured_] = await BondDepository.pendingFor(bob.address, 0);

      expect(matured_).to.equal(false);

      await bob.BondDepository.redeemAll(bob.address);
      expect(await TheopetraERC20Token.balanceOf(bob.address)).to.equal(balance);
    });

    it('should not be redeemable before the vesting time has passed', async function () {
      const [, , bob, carol] = users;
      const autoStake = true;

      const balance = await TheopetraERC20Token.balanceOf(bob.address);
      await bob.BondDepository.deposit(bid, depositAmount, initialPrice, bob.address, carol.address, autoStake);

      const latestBlock = await ethers.provider.getBlock('latest');
      const newTimestampInSeconds = latestBlock.timestamp + vesting / 2;
      await ethers.provider.send('evm_mine', [newTimestampInSeconds]);

      const [, , , , matured_] = await BondDepository.pendingFor(bob.address, 0);

      expect(matured_).to.equal(false);

      await bob.BondDepository.redeemAll(bob.address);
      expect(await TheopetraERC20Token.balanceOf(bob.address)).to.equal(balance);
    });

    it('should not allow multiple Notes to be redeeemed before their vesting times have passed', async function () {
      const [, , bob, carol] = users;
      const autoStake = true;

      const balance = await TheopetraERC20Token.balanceOf(bob.address);
      await bob.BondDepository.deposit(bid, depositAmount, initialPrice, bob.address, carol.address, autoStake);
      await bob.BondDepository.deposit(bid, depositAmount, initialPrice * 1.01, bob.address, carol.address, autoStake);
      const bobNotesIndexes = await BondDepository.indexesFor(bob.address);

      expect(bobNotesIndexes.length).to.equal(2);
      const [, , , , matured_] = await BondDepository.pendingFor(bob.address, 0);
      const [, , , , secondMatured_] = await BondDepository.pendingFor(bob.address, 1);

      expect(matured_).to.equal(false);
      expect(secondMatured_).to.equal(false);

      await bob.BondDepository.redeemAll(bob.address);
      expect(await TheopetraERC20Token.balanceOf(bob.address)).to.equal(balance);
    });

    it('can be redeemed after the vesting time has passed, sending sTHEO when `_stake` is true', async function () {
      const [, , bob, carol] = users;
      const autoStake = true;

      const [expectedPayout] = await bob.BondDepository.callStatic.deposit(
        bid,
        depositAmount,
        initialPrice,
        bob.address,
        carol.address,
        autoStake
      );
      await bob.BondDepository.deposit(bid, depositAmount, initialPrice, bob.address, carol.address, autoStake);
      const bobNotesIndexes = await BondDepository.indexesFor(bob.address);

      expect(bobNotesIndexes.length).to.equal(1);

      const latestBlock = await ethers.provider.getBlock('latest');
      const newTimestampInSeconds = latestBlock.timestamp + vesting * 2;
      await ethers.provider.send('evm_mine', [newTimestampInSeconds]);

      await BondDepository.redeemAll(bob.address);
      const bobBalance = Number(await sTheo.balanceOf(bob.address));

      expect(bobBalance).to.greaterThanOrEqual(Number(expectedPayout));
      expect(bobBalance).to.lessThan(Number(expectedPayout) * 1.0001);
    });

    it('can be redeemed after the vesting time has passed, sending THEO when `_stake` is false', async function () {
      const [, , bob, carol] = users;
      const autoStake = false;

      const [expectedPayout] = await bob.BondDepository.callStatic.deposit(
        bid,
        depositAmount,
        initialPrice,
        bob.address,
        carol.address,
        autoStake
      );

      await bob.BondDepository.deposit(bid, depositAmount, initialPrice, bob.address, carol.address, autoStake);
      const bobNotesIndexes = await BondDepository.indexesFor(bob.address);

      expect(bobNotesIndexes.length).to.equal(1);

      await moveTimeForward(vesting * 2);
      await BondDepository.redeemAll(bob.address);
      const bobBalance = Number(await TheopetraERC20Token.balanceOf(bob.address));

      expect(bobBalance).to.greaterThanOrEqual(Number(expectedPayout));
      expect(bobBalance).to.lessThan(Number(expectedPayout) * 1.0001);
    });

    it('allows redeeming of only matured Notes when a call is made to redeem multiple (all) Notes', async function () {
      const [, , bob, carol] = users;
      const autoStake = true;

      // First deposit
      const [firstExpectedPayout] = await bob.BondDepository.callStatic.deposit(
        bid,
        depositAmount,
        initialPrice,
        bob.address,
        carol.address,
        autoStake
      );
      await bob.BondDepository.deposit(bid, depositAmount, initialPrice, bob.address, carol.address, autoStake);

      // Move time forward
      const latestBlock = await ethers.provider.getBlock('latest');
      const newTimestampInSeconds = latestBlock.timestamp + vesting * 2;
      await ethers.provider.send('evm_mine', [newTimestampInSeconds]);

      // Second deposit
      const [secondExpectedPayout] = await bob.BondDepository.callStatic.deposit(
        bid,
        depositAmount,
        initialPrice * 1.01,
        bob.address,
        carol.address,
        autoStake
      );
      await bob.BondDepository.deposit(bid, depositAmount, initialPrice * 1.01, bob.address, carol.address, autoStake);

      const totalExpectedPayoutsOverAllTime = firstExpectedPayout + secondExpectedPayout;

      await BondDepository.redeemAll(bob.address);

      const bobBalance = Number(await sTheo.balanceOf(bob.address));

      expect(bobBalance).to.greaterThanOrEqual(Number(firstExpectedPayout));
      expect(bobBalance).to.lessThan(Number(firstExpectedPayout * 1.0001));
      expect(bobBalance).to.be.lessThan(Number(totalExpectedPayoutsOverAllTime));
    });

    it('allows a user to unstake sTHEO that has been redeemed from a bond note', async function () {
      // Run test only with actual staking contract (mock does not have unstake functionality)
      if (process.env.NODE_ENV !== TESTWITHMOCKS) {
        const [, , bob] = users;
        await bob.BondDepository.deposit(bid, depositAmount, initialPrice, bob.address, bob.address, autoStake);

        // Get the original claims from the bond depo, which have been created when bob depoisited
        const initialBondDepoClaimOne = await Staking.stakingInfo(BondDepository.address, 0);
        expect(Number(initialBondDepoClaimOne.gonsRemaining)).to.be.greaterThan(0);
        expect(Number(initialBondDepoClaimOne.stakingExpiry)).to.be.greaterThan(0);

        // Bob does not have any claims
        await expect(Staking.stakingInfo(bob.address, 0)).to.be.reverted;

        await moveTimeForward(vesting * 2);

        await BondDepository.redeem(bob.address, [0]);

        // Get the claims from the bond depo, which should now have zero values
        const bondDepoClaim = await Staking.stakingInfo(BondDepository.address, 0);
        expect(bondDepoClaim.gonsRemaining).to.equal(0);
        expect(bondDepoClaim.stakingExpiry).to.equal(0);

        // The bond depo claim should have been transfered to bob
        const bobClaim = await Staking.stakingInfo(bob.address, 0);
        expect(Number(bobClaim.gonsRemaining)).to.equal(Number(initialBondDepoClaimOne.gonsRemaining));
        expect(Number(bobClaim.stakingExpiry)).to.equal(Number(initialBondDepoClaimOne.stakingExpiry));

        // Bob should be able to redeem the sTHEO for THEO, using the transfered claim
        const bobTHEOBalance = Number(await TheopetraERC20Token.balanceOf(bob.address));
        const bobSTHEOBalance = Number(await sTheo.balanceOf(bob.address));
        expect(bobTHEOBalance).to.equal(0);

        await moveTimeForward(31536000 * 2);
        await bob.sTheo.approve(Staking.address, bobSTHEOBalance);
        await bob.Staking.unstake(bob.address, [bobSTHEOBalance], false, [0]);

        const bobFinalSTHEOBalance = Number(await sTheo.balanceOf(bob.address));
        const bobFinalTHEOBalance = Number(await TheopetraERC20Token.balanceOf(bob.address));
        expect(bobFinalSTHEOBalance).to.equal(0);
        expect(bobFinalTHEOBalance).to.be.greaterThan(0);
      }
    });

    it('allows a user to unstake sTHEO redeemed from multiple bond notes', async function () {
      // Run test only with actual staking contract (mock does not have unstake functionality)
      if (process.env.NODE_ENV !== TESTWITHMOCKS) {
        const [, , bob] = users;
        const secondDepositAmount = 50000000;
        const thirdDepositAmount = 70000000;
        await bob.BondDepository.deposit(bid, depositAmount, initialPrice, bob.address, bob.address, autoStake);
        await bob.BondDepository.deposit(bid, secondDepositAmount, initialPrice, bob.address, bob.address, autoStake);
        await bob.BondDepository.deposit(bid, thirdDepositAmount, initialPrice, bob.address, bob.address, autoStake);

        await moveTimeForward(vesting * 2);

        await BondDepository.redeem(bob.address, [0, 2]);

        // Get the transfered claims from the bond depo; these should now have zero values for the bond depo
        const bondDepoClaimOne = await Staking.stakingInfo(BondDepository.address, 0);
        expect(bondDepoClaimOne.gonsRemaining).to.equal(0);
        expect(bondDepoClaimOne.stakingExpiry).to.equal(0);
        const bondDepoClaimThree = await Staking.stakingInfo(BondDepository.address, 2);
        expect(bondDepoClaimThree.gonsRemaining).to.equal(0);
        expect(bondDepoClaimThree.stakingExpiry).to.equal(0);

        // Claim two is not yet redeemed and should have non-zero values for the bond depo
        const bondDepoClaimTwo = await Staking.stakingInfo(BondDepository.address, 1);
        expect(Number(bondDepoClaimTwo.gonsRemaining)).to.be.greaterThan(0);
        expect(Number(bondDepoClaimTwo.stakingExpiry)).to.be.greaterThan(0);

        const bobTHEOBalance = Number(await TheopetraERC20Token.balanceOf(bob.address));
        const bobSTHEOBalance = Number(await sTheo.balanceOf(bob.address));
        expect(bobTHEOBalance).to.equal(0);

        // Setup for unstake by bob
        await moveTimeForward(31536000 * 2);
        await bob.sTheo.approve(Staking.address, bobSTHEOBalance);

        // Get gons remaining on each claim and convert to sTHEO amount
        // Bob now has two claims for sTHEO in Staking that can be redeemed for THEO
        const bobClaimOne = await Staking.stakingInfo(bob.address, 0);
        const bobClaimTwo = await Staking.stakingInfo(bob.address, 1);

        const sTheoRemainingClaimOne = await sTheo.balanceForGons(bobClaimOne.gonsRemaining.toBigInt());
        const sTheoRemainingClaimTwo = await sTheo.balanceForGons(bobClaimTwo.gonsRemaining.toBigInt());

        // First unstake by bob, redeeming sTHEO for THEO
        await bob.Staking.unstake(bob.address, [sTheoRemainingClaimOne.toNumber()], false, [0]);
        const bobUpdatedSTHEOBalance = Number(await sTheo.balanceOf(bob.address));
        expect(bobUpdatedSTHEOBalance).to.equal(sTheoRemainingClaimTwo); // Bob's sTHEO from claim two is not yet redeemed

        // Second unstake by bob
        await bob.Staking.unstake(bob.address, [sTheoRemainingClaimTwo.toNumber()], false, [1]);

        await BondDepository.redeem(bob.address, [1]); // Bob redeems remaining note for sTHEO
        const bobFinalSTHEOBalance = Number(await sTheo.balanceOf(bob.address)); // Bob redeems sTHEO from next claim, for THEO
        const expectedSTheoRemaining = await sTheo.balanceForGons(bondDepoClaimTwo.gonsRemaining.toBigInt()); // Use the original value for bond depo claim two gons Remaining to determine expected sTHEO remaining
        expect(bobFinalSTHEOBalance).to.equal(expectedSTheoRemaining);

        const bobFinalTHEOBalance = Number(await TheopetraERC20Token.balanceOf(bob.address));
        expect(bobFinalTHEOBalance).to.equal(sTheoRemainingClaimOne.toNumber() + sTheoRemainingClaimTwo.toNumber());
      }
    });
  });

  describe('Bond pricing', function () {
    describe('Bonding calculator', function () {
      it('a deposit attempt should revert if the bond calculator is not set', async function () {
        const [, , bob, carol] = users;

        await expect(
          bob.BondDepository.deposit(bid, depositAmount, initialPrice, bob.address, carol.address, autoStake)
        ).to.be.revertedWith('No bonding calculator');
      });

      it('a deposit attempt should revert if the bond calculator isset as address zero', async function () {
        const [, , bob, carol] = users;
        const addressZero = await ethers.utils.getAddress('0x0000000000000000000000000000000000000000');

        await Treasury.setTheoBondingCalculator(addressZero);

        await expect(
          bob.BondDepository.deposit(bid, depositAmount, initialPrice, bob.address, carol.address, autoStake)
        ).to.be.revertedWith('No bonding calculator');
      });

      it('a call to get the market price should revert if the bond calculator is not set or set as address zero', async function () {
        const addressZero = await ethers.utils.getAddress('0x0000000000000000000000000000000000000000');

        await expect(BondDepository.marketPrice(bid)).to.be.revertedWith('No bonding calculator');

        await Treasury.setTheoBondingCalculator(addressZero);
        await expect(BondDepository.marketPrice(bid)).to.be.revertedWith('No bonding calculator');
      });
    });

    describe('market price', function () {
      const price = 242674; // To match valuation returned from BondingCalculatorMock

      beforeEach(async function () {
        // Set the address of the bonding calculator
        await Treasury.setTheoBondingCalculator(BondingCalculatorMock.address);
      });

      it('should give accurate payout for price', async function () {
        const price = await BondDepository.marketPrice(bid);
        const amount = 100_000_000_000_000;
        const expectedPayout = amount / Number(price);
        const lowerBound = expectedPayout * 0.9999;

        expect(Number(await BondDepository.payoutFor(amount, 0))).to.be.greaterThan(lowerBound);
      });

      it('gets the market price', async function () {
        const expectedBrv = await expectedBondRateVariable(bid);

        const expectedPrice = Math.floor((price * (10 ** 9 - Number(expectedBrv))) / 10 ** 9);
        const marketPrice = await BondDepository.marketPrice(bid);

        expect(Number(marketPrice)).to.equal(expectedPrice);
      });

      it('limits the discount on the market price to the specified max bond rate variable', async function () {
        const largeBondRateFixed = 10_000_000_000; // 10% (> max bond rate variable)

        await BondDepository.create(
          UsdcTokenMock.address,
          [capacity, initialPrice, buffer],
          [capacityInQuote, fixedTerm],
          [vesting, conclusion],
          [largeBondRateFixed, maxBondRateVariable, discountRateBond, discountRateYield],
          [depositInterval, tuneInterval]
        );

        const expectedPrice = Math.floor((price * (10 ** 9 - Number(maxBondRateVariable))) / 10 ** 9);
        const marketPrice = await BondDepository.marketPrice(1);

        expect(Number(marketPrice)).to.equal(Number(expectedPrice));
      });

      it('allows for a 0% discount on the current market value; that is, allows for 0% bond rate variable', async function () {
        const zeroBondRateFixed = 0;
        const zeroDiscountRateBond = 0;
        const zeroDiscountRateYield = 0;

        await BondDepository.create(
          UsdcTokenMock.address,
          [capacity, initialPrice, buffer],
          [capacityInQuote, fixedTerm],
          [vesting, conclusion],
          [zeroBondRateFixed, maxBondRateVariable, zeroDiscountRateBond, zeroDiscountRateYield],
          [depositInterval, tuneInterval]
        );

        const expectedBrv = await expectedBondRateVariable(1);

        const expectedPrice = Math.floor((price * (10 ** 9 - Number(expectedBrv))) / 10 ** 9);
        const marketPrice = await BondDepository.marketPrice(1);

        expect(Number(marketPrice)).to.equal(Number(price));
        expect(Number(marketPrice)).to.equal(Number(expectedPrice));
      });

      it('has a minimum discount on the bond of 0% (that is, it does not allow a negative discount)', async function () {
        const negativeBondRateFixed = -10_000_000; // -1% in decimal form (i.e. -0.01 with 9 decimals)
        const negativeDiscountRateBond = -10_000_000; // -1% in decimal form (i.e. -0.01 with 9 decimals)
        const negativeDiscountRateYield = -20_000_000; // -2% in decimal form (i.e. -0.02 with 9 decimals)

        await BondDepository.create(
          UsdcTokenMock.address,
          [capacity, initialPrice, buffer],
          [capacityInQuote, fixedTerm],
          [vesting, conclusion],
          [negativeBondRateFixed, maxBondRateVariable, negativeDiscountRateBond, negativeDiscountRateYield],
          [depositInterval, tuneInterval]
        );

        const rawCalculatedBrv = await expectedBondRateVariable(1);
        expect(rawCalculatedBrv).to.be.lessThan(0);

        const expectedPrice = Math.floor((price * (10 ** 9 - 0)) / 10 ** 9);
        const marketPrice = await BondDepository.marketPrice(1);

        expect(Number(marketPrice)).to.equal(Number(price));
        expect(Number(marketPrice)).to.equal(Number(expectedPrice));
      });
    });

    describe('setDiscountRateBond', function () {
      it('updates the market terms with the new Discount Rate Return Bond (Drb)', async function () {
        const [, , , , , initialDiscountRateBond] = await BondDepository.terms(bid);
        expect(initialDiscountRateBond).to.equal(discountRateBond);

        const newExpectedDiscountRateBond = 5_000_000;
        await BondDepository.setDiscountRateBond(bid, newExpectedDiscountRateBond);
        const [, , , , , newDiscountRateBond] = await BondDepository.terms(bid);
        expect(newDiscountRateBond).to.equal(newExpectedDiscountRateBond);
      });

      it('will revert if called by an account other than the policy holder', async function () {
        const [, , bob] = users;

        const newExpectedDiscountRateBond = 5_000_000;
        await expect(bob.BondDepository.setDiscountRateBond(bid, newExpectedDiscountRateBond)).to.be.revertedWith(
          'UNAUTHORIZED'
        );
      });

      it('will update the market price as expected', async function () {
        // Set the address of the bonding calculator to allow market price calculation
        await Treasury.setTheoBondingCalculator(BondingCalculatorMock.address);

        const newExpectedDiscountRateBond = 5_000_000;
        await BondDepository.setDiscountRateBond(bid, newExpectedDiscountRateBond);

        // Calculate the new expected Bond Rate, variable
        const [, , , brFixed, , Drb, Dyb] = await BondDepository.terms(bid);
        const deltaTokenPrice = await Treasury.deltaTokenPrice();
        const deltaTreasuryYield = await Treasury.deltaTreasuryYield();
        const newExpectedBrv =
          Number(brFixed) +
          (Number(Drb) * Number(deltaTokenPrice)) / 10 ** 9 +
          (Number(Dyb) * Number(deltaTreasuryYield)) / 10 ** 9;

        const price = 242674; // To match valuation returned from BondingCalculatorMock
        const newExpectedPrice = Math.floor((price * (10 ** 9 - Number(newExpectedBrv))) / 10 ** 9);

        const newMarketPrice = await BondDepository.marketPrice(bid);

        expect(Number(newMarketPrice)).to.equal(newExpectedPrice);
      });
    });

    describe('setDiscountRateYield', function () {
      it('updates the market terms with the new Discount Rate Return Yield (Dyb)', async function () {
        const [, , , , , , initialDiscountRateYield] = await BondDepository.terms(bid);
        expect(initialDiscountRateYield).to.equal(discountRateYield);

        const newExpectedDiscountRateYield = 7_000_000;
        await BondDepository.setDiscountRateYield(bid, newExpectedDiscountRateYield);
        const [, , , , , , newDiscountRateYield] = await BondDepository.terms(bid);
        expect(newDiscountRateYield).to.equal(newExpectedDiscountRateYield);
      });

      it('will revert if called by an account other than the policy holder', async function () {
        const [, , bob] = users;

        const newExpectedDiscountRateYield = 7_000_000;
        await expect(bob.BondDepository.setDiscountRateYield(bid, newExpectedDiscountRateYield)).to.be.revertedWith(
          'UNAUTHORIZED'
        );
      });

      it('will update the market price as expected', async function () {
        // Set the address of the bonding calculator to allow market price calculation
        await Treasury.setTheoBondingCalculator(BondingCalculatorMock.address);

        const newExpectedDiscountRateYield = 7_000_000;
        await BondDepository.setDiscountRateYield(bid, newExpectedDiscountRateYield);

        // Calculate the new expected Bond Rate, variable
        const [, , , brFixed, , Drb, Dyb] = await BondDepository.terms(bid);
        const deltaTokenPrice = await Treasury.deltaTokenPrice();
        const deltaTreasuryYield = await Treasury.deltaTreasuryYield();
        const newExpectedBrv =
          Number(brFixed) +
          (Number(Drb) * Number(deltaTokenPrice)) / 10 ** 9 +
          (Number(Dyb) * Number(deltaTreasuryYield)) / 10 ** 9;

        const price = 242674; // To match valuation returned from BondingCalculatorMock
        const newExpectedPrice = Math.floor((price * (10 ** 9 - Number(newExpectedBrv))) / 10 ** 9);

        const newMarketPrice = await BondDepository.marketPrice(bid);

        expect(Number(newMarketPrice)).to.equal(newExpectedPrice);
      });
    });
  });

  describe('UI-related', function () {
    beforeEach(async function () {
      // Set the address of the bonding calculator
      await Treasury.setTheoBondingCalculator(BondingCalculatorMock.address);
    });

    it('allows a user to get the current bond discounts (Bond Rate, variable) for all live markets', async function () {
      const [, , bob] = users;

      // create a second market, so multiple markets are live
      await BondDepository.create(
        WETH9.address,
        [capacity, initialPrice, buffer],
        [capacityInQuote, fixedTerm],
        [vesting, conclusion],
        [bondRateFixed, maxBondRateVariable, discountRateBond, discountRateYield],
        [depositInterval, tuneInterval]
      );
      const allLiveMarketsIds = await BondDepository.liveMarkets();

      allLiveMarketsIds.forEach(async (id: any) => {
        const marketBrv = await bob.BondDepository.bondRateVariable(id);
        const expectedBrv = await expectedBondRateVariable(id);

        expect(marketBrv).to.equal(expectedBrv);
      });

      for (let i = 0; i < allLiveMarketsIds.length; i++) {
        const marketBrv = await bob.BondDepository.bondRateVariable(allLiveMarketsIds[i]);
        const expectedBrv = await expectedBondRateVariable(Number(allLiveMarketsIds[i]));

        expect(marketBrv).to.equal(expectedBrv);
      }
    });

    it('allows a user to get the locking (vesting) periods for all live markets', async function () {
      const [, , bob] = users;

      // create a second market, so multiple markets are live
      await BondDepository.create(
        WETH9.address,
        [capacity, initialPrice, buffer],
        [capacityInQuote, fixedTerm],
        [vesting, conclusion],
        [bondRateFixed, maxBondRateVariable, discountRateBond, discountRateYield],
        [depositInterval, tuneInterval]
      );
      const allLiveMarketsIds = await BondDepository.liveMarkets();

      for (let i = 0; i < allLiveMarketsIds.length; i++) {
        const [, marketVestingPeriod] = await bob.BondDepository.terms(allLiveMarketsIds[i]);
        expect(await marketVestingPeriod).to.equal(vesting);
      }
    });

    it('allows a user to buy and lock THEO at a discount, paying with USDC, with the THEO earned automatically being placed into staking', async function () {
      const [, , bob] = users;
      const autoStake = true;
      const initialBobBalance = await TheopetraERC20Token.balanceOf(bob.address);
      const initialStakingTheoBalance = await TheopetraERC20Token.balanceOf(Staking.address);

      // Buy the bond, in USDC market
      await bob.BondDepository.deposit(bid, depositAmount, initialPrice, bob.address, bob.address, autoStake);

      // Check that bond (note) is made
      const bobNotesIndexes = await BondDepository.indexesFor(bob.address);
      expect(bobNotesIndexes.length).to.equal(1);

      // Check that THEO is locked (bond cannot be redeemed before maturity)
      await bob.BondDepository.redeemAll(bob.address);
      expect(await TheopetraERC20Token.balanceOf(bob.address)).to.equal(initialBobBalance);

      // Check that THEO is automatically staked
      const newStakingTHEOBalance = await TheopetraERC20Token.balanceOf(Staking.address);
      expect(Number(initialStakingTheoBalance)).to.be.lessThan(Number(newStakingTHEOBalance));
    });

    it('allows a user to see details for all of their locked bonds, with: payout in sTHEO, purchase date, expiry date, time remaining and discount', async function () {
      const [, , bob] = users;
      const initialTotalTheoSupply = await TheopetraERC20Token.totalSupply();

      const latestBlock = await ethers.provider.getBlock('latest');
      const currentTimestamp = latestBlock.timestamp;
      // First deposit
      await bob.BondDepository.deposit(bid, depositAmount, initialPrice, bob.address, bob.address, autoStake);

      // Second deposit
      await bob.BondDepository.deposit(bid, depositAmount, initialPrice, bob.address, bob.address, autoStake);

      // Get indexes for all user's pending notes
      const bobNotesIndexes = await BondDepository.indexesFor(bob.address);
      expect(bobNotesIndexes.length).to.equal(2);
      // Payout is minted as THEO (and staked as sTHEO)
      const newTotalTheoSupply = await TheopetraERC20Token.totalSupply();
      // Calculate expected payout: based on two identical deposits above
      const expectedPayout = newTotalTheoSupply.sub(initialTotalTheoSupply) / 2;

      for (let i = 0; i < bobNotesIndexes.length; i++) {
        const [payout, createdAt, expiresAt, timeRemaining, marketId, discount] = await BondDepository.pendingFor(
          bob.address,
          bobNotesIndexes[i]
        );

        expect(payout).to.equal(expectedPayout);

        const currentTimestampLowerbound = currentTimestamp * 0.993;
        const currentTimestampUpperbound = currentTimestamp * 1.01;

        expect(createdAt).to.be.greaterThan(currentTimestampLowerbound).and.to.be.lessThan(currentTimestampUpperbound);
        expect(expiresAt)
          .to.be.greaterThan(currentTimestampLowerbound + vesting)
          .and.to.be.lessThan(currentTimestampUpperbound + vesting);
        expect(timeRemaining).to.equal(expiresAt - createdAt);

        const expectedBrv = await expectedBondRateVariable(bid);
        expect(discount).to.equal(expectedBrv);
      }
    });

    it('returns the number of notes for a user', async function () {
      const [, , bob, carol] = users;
      await bob.BondDepository.deposit(bid, depositAmount, initialPrice, bob.address, carol.address, autoStake);
      await bob.BondDepository.deposit(bid, depositAmount, initialPrice, bob.address, carol.address, autoStake);
      await bob.BondDepository.deposit(bid, depositAmount, initialPrice, bob.address, carol.address, autoStake);
      const notesCount = await BondDepository.getNotesCount(bob.address);

      expect(notesCount).to.equal(3);
    });
  });
});
