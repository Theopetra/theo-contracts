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
  describe('Deployment', () => {
    it('deploys as expected', async () => {
      await setup();
    });
  });

  describe('Deposit', () => {
    it('Succeeds when depositor is a RESERVEDEPOSITOR and token is a RESERVETOKEN', async () => {
      const { Treasury, UsdcTokenMock, BondingCalculatorMock, users } = await setup();
      // approve the treasury to spend our token
      await users[0].UsdcTokenMock.approve(Treasury.address, 1000);

      // Enable the Bonding Calculator: Depositing involves a call to `tokenValue`, which in turn needs the Bonding Calculator
      await Treasury.enable(5, UsdcTokenMock.address, BondingCalculatorMock.address);

      // deposit the token into the treasury
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(users[0].Treasury.deposit(1000, UsdcTokenMock.address, 0)).to.not.be.reverted;
    });
  });

  describe('Mint', () => {
    it('should fail when not REWARDSMANAGER', async () => {
      const { users } = await setup();
      await expect(users[1].Treasury.mint(users[1].address, ethers.utils.parseEther('1'))).to.be.revertedWith(
        'Caller is not a Reward manager'
      );
    });

    it('should succeed when REWARDSMANAGER', async () => {
      const { Treasury, owner, users } = await setup();
      // enable the rewards manager
      await Treasury.enable(8, users[1].address, owner);
      await expect(users[1].Treasury.mint(users[1].address, ethers.utils.parseEther('1'))).to.not.be.revertedWith(
        'Caller is not a Reward manager'
      );
    });
  });

  describe('enable', function () {
    it('reverts if a call is made by an address that is not the Governor', async function () {
      const { users } = await setup();

      // enable the rewards manager
      await expect(users[1].Treasury.enable(8, users[1].address, users[0].address)).to.be.revertedWith('UNAUTHORIZED');
    });

    it('can set the address of the yield reporter', async function () {
      const { Treasury, YieldReporterMock } = await setup();

      await expect(Treasury.enable(11, YieldReporterMock.address, YieldReporterMock.address)).to.not.be.reverted;
    });

    it('can set the address of a liquidity pool and the associated bonding calculator contract', async function () {
      const { Treasury, BondingCalculatorMock, UsdcTokenMock } = await setup();

      // const poolExampleAddress = '0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8';
      const tokenAmount = 5;
      const mockPriceFromSqrtPriceX96 = 242674; // To match BondingCalculatorMock value

      await Treasury.enable(5, UsdcTokenMock.address, BondingCalculatorMock.address);
      const tokenValueResponse = await Treasury.tokenValue(UsdcTokenMock.address, tokenAmount);
      expect(tokenValueResponse).to.equal(tokenAmount * mockPriceFromSqrtPriceX96);
    });
  });

  describe('deltaTreasuryYield', function () {
    it('should revert if the yield reporter address is address zero', async function () {
      const { Treasury } = await setup();
      await expect(Treasury.deltaTreasuryYield()).to.be.revertedWith('Zero address: YieldReporter');
    });

    it('should calculate the difference in treasury yield', async function () {
      const { Treasury, YieldReporterMock } = await setup();

      // Use same value as in the mock yield reporter
      const expectedDeltaTreasuryYield = Math.round(((10_000_000_000 - 15_000_000_000) * 10 ** 9) / 15_000_000_000);

      await Treasury.enable(11, YieldReporterMock.address, YieldReporterMock.address);
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

    describe('tokenValue', function () {
      it('should revert if the Bonding Calculator contract address is not set', async function () {
        const { Treasury, UsdcTokenMock } = await setup();

        const poolExampleAddress = '0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8';
        const tokenAmount = 5;

        await expect(Treasury.tokenValue(UsdcTokenMock.address, tokenAmount)).to.be.revertedWith(
          'No Bonding Calculator'
        );
      });

      it('should revert if the Bonding Calculator contract address is address zero', async function () {
        const { Treasury, BondingCalculatorMock, addressZero } = await setup();

        const poolExampleAddress = '0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8';
        const tokenAmount = 5;

        await Treasury.enable(5, poolExampleAddress, addressZero);

        await expect(Treasury.tokenValue(poolExampleAddress, tokenAmount)).to.be.revertedWith('No Bonding Calculator');
      });

      it('should revert if the liquidity pool address is address zero', async function () {
        const { Treasury, BondingCalculatorMock, addressZero } = await setup();

        const tokenAmount = 5;

        await Treasury.enable(5, addressZero, BondingCalculatorMock.address);

        await expect(Treasury.tokenValue(addressZero, tokenAmount)).to.be.revertedWith('No liquidity token');
      });
    });

    describe('deltaTokenPrice', function () {
      it('should get the difference in token price', async function () {
        const { Treasury, UsdcTokenMock, BondingCalculatorMock } = await setup();
        await expect(Treasury.deltaTokenPrice()).to.be.reverted; // Will revert if called before tokenPerformanceUpdate updates contract state, as currentTokenPrice will be zero

        await Treasury.enable(5, UsdcTokenMock.address, BondingCalculatorMock.address);

        // Move forward 8 hours to allow tokenPerformanceUpdate to update contract state
        await moveTimeForward(60 * 60 * 8);
        await Treasury.tokenPerformanceUpdate(UsdcTokenMock.address);

        await expect(Treasury.deltaTokenPrice()).to.not.be.reverted;
        expect(await Treasury.deltaTokenPrice()).to.equal(1);
      });
    });

    describe('tokenPerformanceUpdate', function () {
      let Treasury: TheopetraTreasury;
      let UsdcTokenMock: any;
      let BondingCalculatorMock: any;
      beforeEach(async function () {
        ({ Treasury, UsdcTokenMock, BondingCalculatorMock } = await setup());

        // Enable the bonding calculator for use in getting token price (via tokenPerformanceUpdate)
        await Treasury.enable(5, UsdcTokenMock.address, BondingCalculatorMock.address);
      });

      it('can be called any time', async function () {
        await moveTimeForward(randomIntFromInterval(1, 10_000_000));
        await expect(Treasury.tokenPerformanceUpdate(UsdcTokenMock.address)).to.not.be.reverted;
      });

      it('will not do anything if called immediately after contract creation', async function () {
        await Treasury.tokenPerformanceUpdate(UsdcTokenMock.address);
        await expect(Treasury.deltaTokenPrice()).to.be.reverted; // Will revert if called before tokenPerformanceUpdate updates contract state, as currentTokenPrice will be zero
      });

      it('can be called every 8 hours', async function () {
        for (let i = 0; i < 3; i++) {
          await moveTimeForward(60 * 60 * 8);
          await expect(Treasury.tokenPerformanceUpdate(UsdcTokenMock.address)).to.not.be.reverted;
        }
      });

      it('updates stored token prices only when called at or after 8 hours since contract creation or since the last successfull call', async function () {
        await moveTimeForward(60 * 60 * 8);
        await Treasury.tokenPerformanceUpdate(UsdcTokenMock.address);
        expect(await Treasury.deltaTokenPrice()).to.equal(1);

        // Move forward 5 hours
        await moveTimeForward(60 * 60 * 5);
        await Treasury.tokenPerformanceUpdate(UsdcTokenMock.address);
        expect(await Treasury.deltaTokenPrice()).to.equal(1);

        // Move forward 2 more hour (total of 7 hours)
        await moveTimeForward(60 * 60 * 2);
        await Treasury.tokenPerformanceUpdate(UsdcTokenMock.address);
        expect(await Treasury.deltaTokenPrice()).to.equal(1);

        // Move forward 1 more hour (total of 8 hours)
        await moveTimeForward(60 * 60 * 1);
        await Treasury.tokenPerformanceUpdate(UsdcTokenMock.address);
        expect(await Treasury.deltaTokenPrice()).to.equal(0);
      });

      it('updates stored token prices as expected when called at or beyond every 8 hours', async function () {
        await moveTimeForward(60 * 60 * 8);
        await Treasury.tokenPerformanceUpdate(UsdcTokenMock.address);
        expect(await Treasury.deltaTokenPrice()).to.equal(1);

        await moveTimeForward(60 * 60 * 9);
        await Treasury.tokenPerformanceUpdate(UsdcTokenMock.address);
        expect(await Treasury.deltaTokenPrice()).to.equal(0);

        await moveTimeForward(60 * 60 * 8);
        await Treasury.tokenPerformanceUpdate(UsdcTokenMock.address);
        expect(await Treasury.deltaTokenPrice()).to.equal(0);
      });
    });
  });
});
