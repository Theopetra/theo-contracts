import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';
import {
  TheopetraAuthority,
  TheopetraTreasury,
  TheopetraERC20Mock,
  YieldReporterMock,
  UsdcERC20Mock,
  BondingCalculatorMock,
  TheopetraYieldReporter,
} from '../typechain-types';
import { CONTRACTS, NEWBONDINGCALCULATORMOCK, TESTWITHMOCKS } from '../utils/constants';
import { setupUsers, moveTimeForward, waitFor, randomIntFromInterval } from './utils';
import { getContracts } from '../utils/helpers';

const setup = deployments.createFixture(async () => {
  await deployments.fixture();
  const addressZero = '0x0000000000000000000000000000000000000000';
  const { deployer: owner } = await getNamedAccounts();
  const contracts = await getContracts(CONTRACTS.treasury);
  const NewBondingCalculatorMock = { NewBondingCalculatorMock: await ethers.getContract(NEWBONDINGCALCULATORMOCK) };

  const users = await setupUsers(await getUnnamedAccounts(), contracts);

  // set usdcTokenMock as a reserve token
  await contracts.Treasury.enable(2, contracts.UsdcTokenMock.address, addressZero);
  // set user[0] as reserve depositor
  await contracts.Treasury.enable(0, users[0].address, addressZero);
  // ensure the vault is correctly set on THEO (WILL NEED UPDATED)
  await contracts.TheopetraAuthority.pushVault(contracts.Treasury.address, true);
  // Mint some of our mock token so we have a supply to work with
  await contracts.UsdcTokenMock.mint(users[0].address, 1000 * 100);

  return {
    ...contracts,
    ...NewBondingCalculatorMock,
    owner,
    users,
    addressZero,
  };
});

describe('TheopetraTreasury', () => {
  let Treasury: TheopetraTreasury;
  let UsdcTokenMock: UsdcERC20Mock;
  let BondingCalculatorMock: BondingCalculatorMock;
  let YieldReporter: TheopetraYieldReporter | YieldReporterMock;
  let TheopetraAuthority: TheopetraAuthority;
  let NewBondingCalculatorMock: any;
  let users: any;
  let owner: any;
  let addressZero: any;

  beforeEach(async function () {
    ({
      Treasury,
      UsdcTokenMock,
      BondingCalculatorMock,
      YieldReporter,
      TheopetraAuthority,
      NewBondingCalculatorMock,
      addressZero,
      users,
      owner,
    } = await setup());
  });

  describe('Deployment', () => {
    it('deploys as expected', async () => {
      await setup();
    });
  });

  describe('Deposit', () => {
    it('Succeeds when depositor is a RESERVEDEPOSITOR and token is a RESERVETOKEN', async () => {
      // approve the treasury to spend our token
      await users[0].UsdcTokenMock.approve(Treasury.address, 1000);

      // deposit the token into the treasury
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(users[0].Treasury.deposit(1000, UsdcTokenMock.address, 0)).to.not.be.reverted;
    });
  });

  describe('Mint', () => {
    it('should fail when not REWARDSMANAGER', async () => {
      await expect(users[1].Treasury.mint(users[1].address, ethers.utils.parseEther('1'))).to.be.revertedWith(
        'Caller is not a Reward manager'
      );
    });

    it('should succeed when REWARDSMANAGER', async () => {
      // enable the rewards manager
      await Treasury.enable(8, users[1].address, owner);
      await expect(users[1].Treasury.mint(users[1].address, ethers.utils.parseEther('1'))).to.not.be.revertedWith(
        'Caller is not a Reward manager'
      );
    });
  });

  describe('enable', function () {
    it('reverts if a call is made by an address that is not the Governor', async function () {
      // enable the rewards manager
      await expect(users[1].Treasury.enable(8, users[1].address, users[0].address)).to.be.revertedWith('UNAUTHORIZED');
    });

    it('can set the address of the yield reporter', async function () {
      await expect(Treasury.enable(11, YieldReporter.address, addressZero)).to.not.be.reverted;
    });
  });

  describe('queueTimelock', function () {
    it('reverts if a call is made by an address that is not the Governor', async function () {
      // enable the rewards manager
      await expect(users[1].Treasury.queueTimelock(11, addressZero, addressZero)).to.be.revertedWith('UNAUTHORIZED');
    });

    it('succeeds if a call is made by an address that is the Governor', async function () {
      // enable the rewards manager
      await expect(Treasury.initialize()).to.not.be.reverted;
      await expect(Treasury.queueTimelock(11, YieldReporter.address, addressZero)).to.not.be.reverted;
    });

    it('can\'t be called before the timelock period is up', async function () {
      // enable the rewards manager
      await expect(Treasury.initialize()).to.not.be.reverted;
      await expect(Treasury.queueTimelock(11, YieldReporter.address, addressZero)).to.not.be.reverted;
      await expect(Treasury.execute(0)).to.be.revertedWith('Timelock not complete');
    });

    it('can be called by anyone after timelock period is up, but only once', async function () {
      // enable the rewards manager
      await expect(Treasury.initialize()).to.not.be.reverted;
      await expect(Treasury.queueTimelock(11, YieldReporter.address, addressZero)).to.not.be.reverted;

      for (let i = 0; i < 5760*2 + 1; i++) {
        await ethers.provider.send('evm_mine', []);
      }

      await expect(users[1].Treasury.execute(0)).to.not.be.reverted;
      await expect(users[1].Treasury.execute(0)).to.be.revertedWith('Action has already been executed');
    });

    it('can be nullified by the governor', async function () {
      // enable the rewards manager
      await expect(Treasury.initialize()).to.not.be.reverted;
      await expect(Treasury.queueTimelock(11, YieldReporter.address, addressZero)).to.not.be.reverted;
      await expect(users[1].Treasury.nullify(0)).to.be.reverted;
      await expect(Treasury.nullify(0)).to.not.be.reverted;
      await expect(Treasury.execute(0)).to.be.revertedWith('Action has been nullified');
    });
  });

  describe('deltaTreasuryYield', function () {
    it('should revert if the yield reporter address is address zero', async function () {
      if (process.env.NODE_ENV !== TESTWITHMOCKS) {
        //Set address back to zero (if not using mocks, then the yield reporter address is already set)
        await Treasury.enable(11, addressZero, addressZero);
      }
      await expect(Treasury.deltaTreasuryYield()).to.be.revertedWith('Zero address: YieldReporter');
    });

    it('should calculate the difference in treasury yield', async function () {
      let expectedDeltaTreasuryYield;
      if (process.env.NODE_ENV === TESTWITHMOCKS) {
        // Use same value as in the mock yield reporter
        expectedDeltaTreasuryYield = Math.floor(((24_000_000_000 - 15_000_000_000) * 10 ** 9) / 15_000_000_000);
      } else {
        // If not using the mock, report a couple of yields using the Yield Reporter (for use when calculating deltaTreasuryYield)
        const lastYield = 50_000_000_000;
        const currentYield = 150_000_000_000;
        await waitFor(YieldReporter.reportYield(50_000_000_000));
        await waitFor(YieldReporter.reportYield(currentYield));
        expectedDeltaTreasuryYield = Math.floor(((currentYield - lastYield) * 10 ** 9) / lastYield);
      }

      await Treasury.enable(11, YieldReporter.address, addressZero);
      expect(Number(await Treasury.deltaTreasuryYield())).to.equal(expectedDeltaTreasuryYield);
    });
  });

  describe('Token price', function () {
    describe('deltaTokenPrice', function () {
      it('should get the difference in token price', async function () {
        await expect(Treasury.deltaTokenPrice()).to.be.reverted; // Will revert if called before tokenPerformanceUpdate updates contract state, as currentTokenPrice will be zero

        // set the address of the mock bonding calculator
        await Treasury.setTheoBondingCalculator(BondingCalculatorMock.address);

        // Move forward 8 hours to allow tokenPerformanceUpdate to update contract state
        // current token price will subsequently be updated, last token price will still be zero
        await moveTimeForward(60 * 60 * 8);
        await Treasury.tokenPerformanceUpdate();

        // Last token price is still zero
        await expect(Treasury.deltaTokenPrice()).to.be.reverted;

        // Move forward in time again to update again, this time current token price becomes last token price
        await moveTimeForward(60 * 60 * 8);
        await Treasury.tokenPerformanceUpdate();

        await expect(Treasury.deltaTokenPrice()).to.not.be.reverted;
        expect(await Treasury.deltaTokenPrice()).to.equal(0);
      });
    });

    describe('tokenPerformanceUpdate', function () {
      beforeEach(async function () {
        // set the address of the mock bonding calculator
        await Treasury.setTheoBondingCalculator(BondingCalculatorMock.address);
      });

      it('can be called any time', async function () {
        await moveTimeForward(randomIntFromInterval(1, 10_000_000));
        await expect(Treasury.tokenPerformanceUpdate()).to.not.be.reverted;
      });

      it('will not do anything if called immediately after contract creation', async function () {
        await Treasury.tokenPerformanceUpdate();
        await expect(Treasury.deltaTokenPrice()).to.be.reverted; // Will revert if called before tokenPerformanceUpdate updates contract state, as currentTokenPrice will be zero
      });

      it('can be called every 8 hours', async function () {
        for (let i = 0; i < 3; i++) {
          await moveTimeForward(60 * 60 * 8);
          await expect(Treasury.tokenPerformanceUpdate()).to.not.be.reverted;
        }
      });

      it.skip('updates stored token prices only when called at or after 8 hours since contract creation or since the last successfull call', async function () {
        await moveTimeForward(60 * 60 * 8);
        await Treasury.tokenPerformanceUpdate();

        // Move forward in time again to update again, this time current token price becomes last token price
        await moveTimeForward(60 * 60 * 8);
        await Treasury.tokenPerformanceUpdate();

        expect(await Treasury.deltaTokenPrice()).to.equal(0);

        // Move forward 5 hours
        await moveTimeForward(60 * 60 * 5);
        await Treasury.tokenPerformanceUpdate();
        expect(await Treasury.deltaTokenPrice()).to.equal(0);

        // Move forward 2 more hour (total of 7 hours)
        await moveTimeForward(60 * 60 * 2);
        await Treasury.tokenPerformanceUpdate();
        expect(await Treasury.deltaTokenPrice()).to.equal(0);

        // Move forward 1 more hour (total of 8 hours)
        await moveTimeForward(60 * 60 * 1);
        await Treasury.tokenPerformanceUpdate();
        expect(await Treasury.deltaTokenPrice()).to.equal(0);
      });

      it.skip('updates stored token prices as expected when called at or beyond every 8 hours', async function () {
        await moveTimeForward(60 * 60 * 8);
        await Treasury.tokenPerformanceUpdate();
        expect(await Treasury.deltaTokenPrice()).to.equal(0);

        await moveTimeForward(60 * 60 * 9);
        await Treasury.tokenPerformanceUpdate();
        expect(await Treasury.deltaTokenPrice()).to.equal(0);

        await moveTimeForward(60 * 60 * 8);
        await Treasury.tokenPerformanceUpdate();
        expect(await Treasury.deltaTokenPrice()).to.equal(0);
      });
    });
  });

  describe('theo bonding calculator', function () {
    it('has a function to set the bonding calculator address', async function () {
      await expect(Treasury.setTheoBondingCalculator(BondingCalculatorMock.address)).to.not.be.reverted;
    });

    it('has a function to get the bonding calculator address', async function () {
      await Treasury.setTheoBondingCalculator(BondingCalculatorMock.address);
      await expect(Treasury.getTheoBondingCalculator()).to.not.be.reverted;
      expect(await Treasury.getTheoBondingCalculator()).to.equal(BondingCalculatorMock.address);
    });

    it('will revert if an attempt is made by an account other than the guardian to set the bonding calculator address', async function () {
      const [, , bob] = users;

      await expect(bob.Treasury.setTheoBondingCalculator(BondingCalculatorMock.address)).to.be.revertedWith(
        'UNAUTHORIZED'
      );
    });

    it('allows the guardian to set the bonding calculator address', async function () {
      const [, , bob] = users;

      await TheopetraAuthority.pushGuardian(bob.address, true);

      await expect(bob.Treasury.setTheoBondingCalculator(BondingCalculatorMock.address)).to.not.be.reverted;
      expect(await Treasury.getTheoBondingCalculator()).to.equal(BondingCalculatorMock.address);
    });

    describe('NewBondingCalculatorMock', async function () {
      beforeEach(async function () {
        // set the address of the mock bonding calculator
        await Treasury.setTheoBondingCalculator(NewBondingCalculatorMock.address);
      });

      it('updates a stored value for `performanceTokenAmount`, via a call to `updatePerformanceTokenAmount`, to allow deltaTokenPrice to be updated', async function () {
        // Set initial value for performance token
        const initialPerformanceTokenAmount = 1000000000;
        await NewBondingCalculatorMock.setPerformanceTokenAmount(initialPerformanceTokenAmount);

        await moveTimeForward(60 * 60 * 8);
        await Treasury.tokenPerformanceUpdate();
        // Need to call tokenPerformanceUpdate twice initially, before `lastTokenPrice` becomes non-zero (otherwise `deltaTokenPrice will revert`)
        await moveTimeForward(60 * 60 * 8);
        await NewBondingCalculatorMock.updatePerformanceTokenAmount(125);
        // tokenPerformanceUpdate needs to be called after `updatePerformanceTokenAmount`. This will subsequently change `deltaTokenPrice`
        await Treasury.tokenPerformanceUpdate();

        const deltaTokenPrice = await Treasury.deltaTokenPrice();
        expect((deltaTokenPrice.toNumber() / 10 ** 9) * 100).to.equal(125);

        await moveTimeForward(60 * 60 * 8);
        await NewBondingCalculatorMock.updatePerformanceTokenAmount(125);
        await Treasury.tokenPerformanceUpdate();

        const deltaTokenPriceSecond = await Treasury.deltaTokenPrice();
        expect((deltaTokenPriceSecond.toNumber() / 10 ** 9) * 100).to.equal(125);
      });
    });
  });
});
