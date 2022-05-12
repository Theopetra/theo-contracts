import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';

import { setupUsers, performanceUpdate, waitFor, decodeLogs } from './utils';
import { CONTRACTS, TESTWITHMOCKS } from '../utils/constants';
import { getContracts } from '../utils/helpers';

import {
  WETH9,
  WethHelper,
  BondingCalculatorMock,
  WhitelistTheopetraBondDepository,
  AggregatorMockETH,
  SignerHelper__factory,
  TheopetraStaking,
  TheopetraERC20Token,
  STheopetra,
} from '../typechain-types';

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
  const fixedBondPrice = 10e9; // 10 USD per THEO (9 decimals), for Whitelist Bond Depo market

  let BondDepository: any;
  let BondingCalculatorMock: BondingCalculatorMock;
  let WhitelistBondDepository: WhitelistTheopetraBondDepository;
  let WethHelperBondDepo: WethHelper;
  let Treasury: any;
  let YieldReporter: any;
  let WETH: WETH9;
  let AggregatorMockETH: AggregatorMockETH;
  let Staking: TheopetraStaking;
  let TheopetraERC20Token: TheopetraERC20Token;
  let sTheo: STheopetra;
  let users: any;
  let conclusion: number;
  let block: any;
  let signature: any;

  beforeEach(async function () {
    ({
      BondDepository,
      WETH9: WETH,
      WethHelper: WethHelperBondDepo,
      Treasury,
      YieldReporter,
      BondingCalculatorMock,
      WhitelistBondDepository,
      AggregatorMockETH,
      Staking,
      TheopetraERC20Token,
      sTheo,
      users,
    } = await setup());

    // Set WethHelper address on Whitelist Bond Depo contract
    await waitFor(WhitelistBondDepository.setWethHelper(WethHelperBondDepo.address));

    block = await ethers.provider.getBlock('latest');
    conclusion = block.timestamp + timeToConclusion;
    // Create market in regular Bond Depo
    await waitFor(
      BondDepository.create(
        WETH.address,
        [capacity, initialPrice, buffer],
        [capacityInQuote, fixedTerm],
        [vesting, conclusion],
        [bondRateFixed, maxBondRateVariable, discountRateBond, discountRateYield],
        [depositInterval, tuneInterval]
      )
    );
    expect(await BondDepository.isLive(bid)).to.equal(true);

    // Setup for successful calls to `marketPrice` (during `deposit`) when test use wired-up contracts
    if (process.env.NODE_ENV !== TESTWITHMOCKS) {
      await performanceUpdate(Treasury, YieldReporter, BondingCalculatorMock.address);
    }
  });

  async function setupForWhitelistDeposit() {
    const [governorWallet] = await ethers.getSigners();
    const [, bob] = users;

    // Deploy SignerHelper contract
    const signerHelperFactory = new SignerHelper__factory(governorWallet);
    const SignerHelper = await signerHelperFactory.deploy();
    // Create a hash in the same way as created by Signed contract
    const bobHash = await SignerHelper.createHash('', bob.address, WethHelperBondDepo.address, 'supersecret');

    // Set the secret on the Signed contract
    await WethHelperBondDepo.setSecret('supersecret');

    // 32 bytes of data in Uint8Array
    const messageHashBinary = ethers.utils.arrayify(bobHash);

    // To sign the 32 bytes of data, pass in the data
    signature = await governorWallet.signMessage(messageHashBinary);

    // Create market in Whitelist Bond Depo
    await waitFor(
      WhitelistBondDepository.create(
        WETH.address,
        AggregatorMockETH.address,
        [capacity, fixedBondPrice],
        [capacityInQuote, fixedTerm],
        [vesting, conclusion]
      )
    );
    expect(await WhitelistBondDepository.isLive(bid)).to.equal(true);
  }

  describe('Deployment', function () {
    it('it is deployed with the correct constructor arguments', async function () {
      expect(await WethHelperBondDepo.weth()).to.equal(WETH.address);
      expect(await WethHelperBondDepo.bondDepo()).to.equal(BondDepository.address);
      expect(await WethHelperBondDepo.whitelistBondDepo()).to.equal(WhitelistBondDepository.address);
    });
  });

  describe('deposit', function () {
    beforeEach(async function () {
      // Set the address of the bonding calculator
      await Treasury.setTheoBondingCalculator(BondingCalculatorMock.address);
    });

    describe('with Bond Depo (not Whitelist)', function () {
      // Use a mock signature, as deposit is not being made to the Whitelist Bond Depo
      const mockSignature = [0x000000000000000000000000000000000000000000000000000000000000000];
      const isWhitelist = false;

      it('can receive ETH which is then deposited as WETH for a user, in a bond market', async function () {
        const [, bob] = users;

        const { events } = await waitFor(
          bob.WethHelper.deposit(bid, initialPrice, bob.address, bob.address, false, isWhitelist, mockSignature, {
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
          bob.WethHelper.deposit(bid, initialPrice, bob.address, bob.address, false, isWhitelist, mockSignature, {
            value: 0,
          })
        ).to.be.revertedWith('No value');
      });

      it('should stake the payout if autostake is true', async function () {
        const [, bob] = users;
        const autoStake = true;

        const initialStakingTheoBalance = await TheopetraERC20Token.balanceOf(Staking.address);

        const { events } = await waitFor(
          bob.WethHelper.deposit(bid, initialPrice, bob.address, bob.address, autoStake, isWhitelist, mockSignature, {
            value: ethers.utils.parseEther('1'),
          })
        );

        const newStakingTHEOBalance = await TheopetraERC20Token.balanceOf(Staking.address);
        expect(Number(initialStakingTheoBalance)).to.be.lessThan(Number(newStakingTHEOBalance));
      });

      it('allows a user to bond then redeem', async function () {
        const [, bob] = users;
        const autoStake = true;
        const bobInitialBalance = Number(await sTheo.balanceOf(bob.address));
        await waitFor(
          bob.WethHelper.deposit(bid, initialPrice, bob.address, bob.address, autoStake, isWhitelist, mockSignature, {
            value: ethers.utils.parseEther('1'),
          })
        );

        const latestBlock = await ethers.provider.getBlock('latest');
        const newTimestampInSeconds = latestBlock.timestamp + vesting * 2;
        await ethers.provider.send('evm_mine', [newTimestampInSeconds]);

        await BondDepository.redeemAll(bob.address);
        const bobFinalBalance = Number(await sTheo.balanceOf(bob.address));
        expect(bobFinalBalance).to.be.greaterThan(bobInitialBalance);
      });
    });

    describe('with Whitelist Bond Depo', function () {
      const isWhitelist = true;

      beforeEach(async function () {
        await setupForWhitelistDeposit();
      });

      it('reverts if the user is not whitelisted', async function () {
        const [, , carol] = users;

        await expect(
          carol.WethHelper.deposit(bid, initialPrice, carol.address, carol.address, false, isWhitelist, signature, {
            value: ethers.utils.parseEther('1'),
          })
        ).to.be.revertedWith('Signature verification failed');
      });

      it('can receive ETH which is then deposited as WETH for a user, in a bond market', async function () {
        const [, bob] = users;

        await waitFor(
          bob.WethHelper.deposit(bid, initialPrice, bob.address, bob.address, false, isWhitelist, signature, {
            value: ethers.utils.parseEther('1'),
          })
        );

        const bobNotesIndexes = await WhitelistBondDepository.indexesFor(bob.address);
        expect(bobNotesIndexes.length).to.equal(1);
      });

      it('allows a user to bond and then redeem for THEO', async function () {
        const [, bob] = users;
        const initialBobBalance = await bob.TheopetraERC20Token.balanceOf(bob.address);

        await waitFor(
          bob.WethHelper.deposit(bid, initialPrice, bob.address, bob.address, false, isWhitelist, signature, {
            value: ethers.utils.parseEther('1'),
          })
        );

        const latestBlock = await ethers.provider.getBlock('latest');
        const newTimestampInSeconds = latestBlock.timestamp + vesting * 2;
        await ethers.provider.send('evm_mine', [newTimestampInSeconds]);

        await expect(WhitelistBondDepository.redeemAll(bob.address)).to.not.be.reverted;
        const finalBobBalance = await bob.TheopetraERC20Token.balanceOf(bob.address);
        expect(Number(finalBobBalance)).to.be.greaterThan(Number(initialBobBalance));
      });
    });
  });
});
