import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';
import {
  TheopetraAuthority,
  TheopetraTreasury,
  TheopetraERC20Mock,
  YieldReporterMock,
  UsdcERC20Mock,
  BondingCalculatorMock,
} from '../typechain-types';
import { CONTRACTS, MOCKS, MOCKSWITHARGS } from '../utils/constants';
import { setupUsers } from './utils';

const setup = deployments.createFixture(async () => {
  await deployments.fixture([CONTRACTS.authority, CONTRACTS.treasury, MOCKS.yieldReporterMock]);
  const addressZero = '0x0000000000000000000000000000000000000000';
  const { deployer: owner } = await getNamedAccounts();
  const contracts = {
    UsdcTokenMock: await ethers.getContract(MOCKS.usdcTokenMock),
    Treasury: <TheopetraTreasury>await ethers.getContract(CONTRACTS.treasury),
    Theo: <TheopetraERC20Mock>await ethers.getContract(CONTRACTS.theoToken),
    TheopetraAuthority: <TheopetraAuthority>await ethers.getContract(CONTRACTS.authority),
    YieldReporterMock: <YieldReporterMock>await ethers.getContract(MOCKS.yieldReporterMock),
    BondingCalculatorMock: await ethers.getContract(MOCKSWITHARGS.bondingCalculatorMock),
  };

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
    owner,
    users,
    addressZero,
  };
});

describe('TheopetraTreasury', () => {
  let Treasury: TheopetraTreasury;
  let UsdcTokenMock: any;
  let BondingCalculatorMock: any;
  let YieldReporterMock: any;
  let TheopetraAuthority: any;
  let users: any;
  let owner: any;
  let addressZero: any;

  beforeEach(async function () {
    ({ Treasury, UsdcTokenMock, BondingCalculatorMock, YieldReporterMock, TheopetraAuthority, addressZero, users, owner } = await setup());
  })

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
      await expect(Treasury.enable(11, YieldReporterMock.address, addressZero)).to.not.be.reverted;
    });
  });

  describe('deltaTreasuryYield', function () {
    it('should revert if the yield reporter address is address zero', async function () {
      await expect(Treasury.deltaTreasuryYield()).to.be.revertedWith('Zero address: YieldReporter');
    });

    it('should calculate the difference in treasury yield', async function () {
      // Use same value as in the mock yield reporter
      const expectedDeltaTreasuryYield = Math.round(((10_000_000_000 - 15_000_000_000) * 10 ** 9) / 15_000_000_000);

      await Treasury.enable(11, YieldReporterMock.address, addressZero);
      expect(Number(await Treasury.deltaTreasuryYield())).to.equal(expectedDeltaTreasuryYield);
    });
  });

  describe('Token price', function () {
    async function moveTimeForward(timeInSeconds: number) {
      const latestBlock = await ethers.provider.getBlock('latest');
      const newTimestampInSeconds = latestBlock.timestamp + timeInSeconds;
      await ethers.provider.send('evm_mine', [newTimestampInSeconds]);
    }

    function randomIntFromInterval(min: number, max: number) {
      return Math.floor(Math.random() * (max - min + 1) + min);
    }

    describe('deltaTokenPrice', function () {
      it('should get the difference in token price', async function () {
        await expect(Treasury.deltaTokenPrice()).to.be.reverted; // Will revert if called before tokenPerformanceUpdate updates contract state, as currentTokenPrice will be zero

        // set the address of the mock bonding calculator
        await Treasury.setTheoBondingCalculator(BondingCalculatorMock.address);

        // Move forward 8 hours to allow tokenPerformanceUpdate to update contract state
        await moveTimeForward(60 * 60 * 8);
        await Treasury.tokenPerformanceUpdate();

        await expect(Treasury.deltaTokenPrice()).to.not.be.reverted;
        expect(await Treasury.deltaTokenPrice()).to.equal(1);
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

      it('updates stored token prices only when called at or after 8 hours since contract creation or since the last successfull call', async function () {
        await moveTimeForward(60 * 60 * 8);
        await Treasury.tokenPerformanceUpdate();
        expect(await Treasury.deltaTokenPrice()).to.equal(1);

        // Move forward 5 hours
        await moveTimeForward(60 * 60 * 5);
        await Treasury.tokenPerformanceUpdate();
        expect(await Treasury.deltaTokenPrice()).to.equal(1);

        // Move forward 2 more hour (total of 7 hours)
        await moveTimeForward(60 * 60 * 2);
        await Treasury.tokenPerformanceUpdate();
        expect(await Treasury.deltaTokenPrice()).to.equal(1);

        // Move forward 1 more hour (total of 8 hours)
        await moveTimeForward(60 * 60 * 1);
        await Treasury.tokenPerformanceUpdate();
        expect(await Treasury.deltaTokenPrice()).to.equal(0);
      });

      it('updates stored token prices as expected when called at or beyond every 8 hours', async function () {
        await moveTimeForward(60 * 60 * 8);
        await Treasury.tokenPerformanceUpdate();
        expect(await Treasury.deltaTokenPrice()).to.equal(1);

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
  })
});
