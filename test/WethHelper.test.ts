import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';

import { setupUsers, performanceUpdate, waitFor, decodeLogs } from './utils';
import { CONTRACTS, TESTWITHMOCKS } from '../utils/constants';
import { getContracts } from '../utils/helpers';

import { WETH9, WethHelper, BondingCalculatorMock } from '../typechain-types';

const setup = deployments.createFixture(async () => {
  await deployments.fixture();
  const { deployer: owner } = await getNamedAccounts();

  const contracts = await getContracts(CONTRACTS.WethHelper);

  const users = await setupUsers(await getUnnamedAccounts(), contracts);

  return {
    ...contracts,
    users,
    owner,
  };
});

describe.only('WethHelper', function () {
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
  const bondRateFixed = 10_000_000; // 1% in decimal form (i.e. 0.01 with 9 decimals)
  const maxBondRateVariable = 40_000_000; // 4% in decimal form (i.e. 0.04 with 9 decimals)
  const discountRateBond = 10_000_000; // 1% in decimal form (i.e. 0.01 with 9 decimals)
  const discountRateYield = 20_000_000; // 2% in decimal form (i.e. 0.02 with 9 decimals)

  let BondDepository: any;
  let BondingCalculatorMock: BondingCalculatorMock;
  let WethHelperBondDepo: WethHelper;
  let Treasury: any;
  let YieldReporter: any;
  let WETH: WETH9;
  let users: any;
  let conclusion: number;
  let block: any;

  beforeEach(async function () {
    ({
      BondDepository,
      users,
      WETH9: WETH,
      WethHelper: WethHelperBondDepo,
      Treasury,
      YieldReporter,
      BondingCalculatorMock,
    } = await setup());

    block = await ethers.provider.getBlock('latest');
    conclusion = block.timestamp + timeToConclusion;

    await BondDepository.create(
      WETH.address,
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
    it('it is deployed with the correct constructor arguments', async function () {
      const wethAddress = await WethHelperBondDepo.weth();
      const bondDepoAddress = await WethHelperBondDepo.bondDepo();
      expect(wethAddress).to.equal(WETH.address);
      expect(bondDepoAddress).to.equal(BondDepository.address);
    });
  });

  describe('deposit', function () {
    beforeEach(async function () {
      // Set the address of the bonding calculator
      await Treasury.setTheoBondingCalculator(BondingCalculatorMock.address);
    });

    it('can receive ETH which is then deposited as WETH for a user, in a bond market', async function () {
      const [, bob] = users;

      const { events } = await waitFor(
        bob.WethHelper.deposit(bid, initialPrice, bob.address, bob.address, false, {
          value: ethers.utils.parseEther('1'),
        })
      );

      const wethHelperBalance = await WETH.balanceOf(WethHelperBondDepo.address);
      expect(wethHelperBalance).to.equal(0);

      // Bond made for Bob
      const bobNotesIndexes = await BondDepository.indexesFor(bob.address);
      expect(bobNotesIndexes.length).to.equal(1);

      const [bondLog] = decodeLogs(events, [BondDepository]);
      expect(bondLog.name).to.equal('Bond');
      const [, amount] = bondLog.args;
      expect(amount).to.equal(ethers.utils.parseEther('1'));
    });

    it('will revert if the msg.value is zero', async function () {
      const [, bob] = users;

      await expect(
        bob.WethHelper.deposit(bid, initialPrice, bob.address, bob.address, false, {
          value: 0,
        })
      ).to.be.revertedWith('No value');
    });
  });
});
