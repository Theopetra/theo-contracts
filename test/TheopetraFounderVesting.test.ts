import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';
import { moveTimeForward, setupUsers } from './utils';
import { CAPTABLE, CONTRACTS, FDVTARGET, INITIALMINT, TESTWITHMOCKS, UNLOCKSCHEDULE } from '../utils/constants';
import { getContracts } from '../utils/helpers';

const badAddress = '0x0000000000000000000000000000000000001234';

const setup = deployments.createFixture(async function () {
  await deployments.fixture([CONTRACTS.founderVesting]);

  const { deployer: owner } = await getNamedAccounts();
  const contracts = await getContracts();

  const users = await setupUsers(await getUnnamedAccounts(), contracts);

  if (process.env.NODE_ENV !== TESTWITHMOCKS) {
    await contracts.Treasury.enable(8, users[1].address, owner);
  }

  return {
    ...contracts,
    users,
    owner,
  };
});

describe('Theopetra Founder Vesting', function () {
  let TheopetraFounderVesting: any;
  let TheopetraTreasury: any;
  let TheopetraERC20Token: any;
  let BondingCalculatorMock: any;

  let owner: any;
  let users: any;

  beforeEach(async function () {
    ({
      FounderVesting: TheopetraFounderVesting,
      Treasury: TheopetraTreasury,
      TheopetraERC20Token,
      BondingCalculatorMock,
      users,
      owner,
    } = await setup());
  });

  describe('Deployment', function () {
    it('can be deployed', async function () {
      expect(TheopetraFounderVesting).to.not.be.undefined;
    });
    it('sets total released THEO tokens to 0', async function () {
      const totalReleased = await TheopetraFounderVesting.getTotalReleased(TheopetraERC20Token.address);
      expect(totalReleased).to.equal(ethers.constants.Zero);
    });
  });

  describe('initialMint', function () {
    it('reverts if initialMint is called more than once', async function () {
      await users[1].Treasury.mint((await ethers.getSigners())[5].address, INITIALMINT);
      await TheopetraFounderVesting.initialMint();

      await expect(TheopetraFounderVesting.initialMint()).to.be.revertedWith(
        'TheopetraFounderVesting: initialMint can only be run once'
      );
    });
    it('mints tokens to the vesting contract to cover the input shares', async function () {
      await users[1].Treasury.mint((await ethers.getSigners())[5].address, INITIALMINT);
      const totalShares = CAPTABLE.shares.reduce((acc, curr) => acc.add(curr), ethers.constants.Zero);
      const expectedMint = totalShares
        .mul(INITIALMINT)
        .div(ethers.BigNumber.from(10 ** (await TheopetraFounderVesting.decimals())).sub(totalShares));

      await TheopetraFounderVesting.initialMint();

      expect(await TheopetraERC20Token.balanceOf(TheopetraFounderVesting.address)).to.equal(expectedMint);
    });
  });

  describe('decimals', function () {
    it('returns 9', async function () {
      const decimals = await TheopetraFounderVesting.decimals();
      expect(decimals).to.equal(9);
    });
  });

  describe('getTotalShares', function () {
    it('returns the sum of all shares', async function () {
      const totalShares = await TheopetraFounderVesting.getTotalShares();
      const expectedShares = CAPTABLE.shares.reduce((acc, curr) => acc.add(curr), ethers.constants.Zero);
      expect(totalShares).to.equal(expectedShares);
    });
  });

  describe('getShares', function () {
    it('returns the number of shares for a given account', async function () {
      const acctShares = await TheopetraFounderVesting.getShares(CAPTABLE.addresses[0]);
      const expectedShares = CAPTABLE.shares[0];
      expect(acctShares).to.equal(expectedShares);
    });
    it('returns 0 for a unknown account', async function () {
      const acctShares = await TheopetraFounderVesting.getShares(badAddress);
      expect(acctShares).to.equal(0);
    });
  });

  describe('getReleased', function () {
    beforeEach(async function () {
      TheopetraTreasury.setTheoBondingCalculator(BondingCalculatorMock.address);
      BondingCalculatorMock.setValuation(100_000_000);
      await users[1].Treasury.mint((await ethers.getSigners())[5].address, INITIALMINT);
      await TheopetraFounderVesting.initialMint();
      // move forward 1 hour past unlock schedule
      await moveTimeForward(UNLOCKSCHEDULE.times[UNLOCKSCHEDULE.times.length - 1] + 3600);
    });
    it('returns 0 if nothing has been released', async function () {
      const released = await TheopetraFounderVesting.getReleased(TheopetraERC20Token.address, CAPTABLE.addresses[0]);
      expect(released).to.equal(ethers.constants.Zero);
    });
    it('returns quantity of released tokens if tokens has been released', async function () {
      const totalBalance = await TheopetraERC20Token.balanceOf(TheopetraFounderVesting.address);
      const totalShares = CAPTABLE.shares.reduce((acc, curr) => acc.add(curr), ethers.constants.Zero);
      const expectedReleased = totalBalance.mul(CAPTABLE.shares[0]).div(totalShares);

      await TheopetraFounderVesting.release(TheopetraERC20Token.address);
      const released = await TheopetraFounderVesting.getReleased(TheopetraERC20Token.address, CAPTABLE.addresses[0]);
      expect(released).to.equal(expectedReleased);
    });
  });

  describe('release', function () {
    beforeEach(async function () {
      TheopetraTreasury.setTheoBondingCalculator(BondingCalculatorMock.address);
      BondingCalculatorMock.setValuation(100_000_000);
      await users[1].Treasury.mint((await ethers.getSigners())[5].address, INITIALMINT);
      await TheopetraFounderVesting.initialMint();
      // move forward 1 hour past unlock schedule
      await moveTimeForward(UNLOCKSCHEDULE.times[UNLOCKSCHEDULE.times.length - 1] + 3600);
    });
    it('reverts if no shares designated to address', async function () {
      await expect(
        TheopetraFounderVesting.connect((await ethers.getSigners())[1]).release(TheopetraERC20Token.address)
      ).to.be.revertedWith('TheopetraFounderVesting: account has no shares');
    });
    it('reverts if no payment due to address', async function () {
      // clean out initial funds
      await TheopetraFounderVesting.release(TheopetraERC20Token.address);
      // Trying again should fail
      await expect(TheopetraFounderVesting.release(TheopetraERC20Token.address)).to.be.revertedWith(
        'TheopetraFounderVesting: account is not due payment'
      );
    });
    it('increases total released', async function () {
      const totalShares = CAPTABLE.shares.reduce((acc, curr) => acc.add(curr), ethers.constants.Zero);
      const expectedMint = totalShares
        .mul(INITIALMINT)
        .div(ethers.BigNumber.from(10 ** (await TheopetraFounderVesting.decimals())).sub(totalShares));
      const expectedReleased = ethers.BigNumber.from(expectedMint).mul(CAPTABLE.shares[0]).div(totalShares);
      const initialReleased = await TheopetraFounderVesting.getTotalReleased(TheopetraERC20Token.address);

      await TheopetraFounderVesting.release(TheopetraERC20Token.address);

      const totalReleased = await TheopetraFounderVesting.getTotalReleased(TheopetraERC20Token.address);

      expect(initialReleased).to.equal(0);
      expect(totalReleased).to.equal(expectedReleased);
    });
    it('increases balance of address', async function () {
      const totalShares = CAPTABLE.shares.reduce((acc, curr) => acc.add(curr), ethers.constants.Zero);
      const expectedMint = totalShares
        .mul(INITIALMINT)
        .div(ethers.BigNumber.from(10 ** (await TheopetraFounderVesting.decimals())).sub(totalShares));
      const expectedReleased = ethers.BigNumber.from(expectedMint).mul(CAPTABLE.shares[0]).div(totalShares);
      const initialBalance = await TheopetraERC20Token.balanceOf(CAPTABLE.addresses[0]);

      await TheopetraFounderVesting.release(TheopetraERC20Token.address);
      const releasedBalance = await TheopetraERC20Token.balanceOf(CAPTABLE.addresses[0]);

      expect(initialBalance).to.equal(0);
      expect(releasedBalance).to.equal(expectedReleased);
    });
    it('emits an event', async function () {
      const totalShares = CAPTABLE.shares.reduce((acc, curr) => acc.add(curr), ethers.constants.Zero);
      const expectedMint = totalShares
        .mul(INITIALMINT)
        .div(ethers.BigNumber.from(10 ** (await TheopetraFounderVesting.decimals())).sub(totalShares));
      const expectedReleased = ethers.BigNumber.from(expectedMint).mul(CAPTABLE.shares[0]).div(totalShares);

      await expect(TheopetraFounderVesting.release(TheopetraERC20Token.address))
        .to.emit(TheopetraFounderVesting, 'ERC20PaymentReleased')
        .withArgs(TheopetraERC20Token.address, CAPTABLE.addresses[0], expectedReleased);
    });
  });

  describe('scheduled release', function () {
    beforeEach(async function () {
      TheopetraTreasury.setTheoBondingCalculator(BondingCalculatorMock.address);
      BondingCalculatorMock.setValuation(100_000_000);
      await users[1].Treasury.mint((await ethers.getSigners())[5].address, INITIALMINT);
      await TheopetraFounderVesting.initialMint();
    });
    it('reverts if no payment due to address at deploy time', async function () {
      // Attempting release at time 0 should fail
      await expect(TheopetraFounderVesting.release(TheopetraERC20Token.address)).to.be.revertedWith(
        'TheopetraFounderVesting: account is not due payment'
      );
    });
    it('increases balance of address by full shares after full schedule', async function () {
      const totalShares = CAPTABLE.shares.reduce((acc, curr) => acc.add(curr), ethers.constants.Zero);
      const expectedMint = totalShares
        .mul(INITIALMINT)
        .div(ethers.BigNumber.from(10 ** (await TheopetraFounderVesting.decimals())).sub(totalShares));
      const expectedReleased = ethers.BigNumber.from(expectedMint).mul(CAPTABLE.shares[0]).div(totalShares);
      const initialBalance = await TheopetraERC20Token.balanceOf(CAPTABLE.addresses[0]);
      await moveTimeForward(UNLOCKSCHEDULE.times[UNLOCKSCHEDULE.times.length - 1] + 3600);

      await TheopetraFounderVesting.release(TheopetraERC20Token.address);
      const releasedBalance = await TheopetraERC20Token.balanceOf(CAPTABLE.addresses[0]);

      expect(initialBalance).to.equal(0);
      expect(releasedBalance).to.equal(expectedReleased);
    });
    it('increases balance of address proportionally to the time in the schedule', async function () {
      const travelTime = UNLOCKSCHEDULE.times[2] + 3600;
      const totalShares = CAPTABLE.shares.reduce((acc, curr) => acc.add(curr), ethers.constants.Zero);
      const expectedMint = totalShares
        .mul(INITIALMINT)
        .div(ethers.BigNumber.from(10 ** (await TheopetraFounderVesting.decimals())).sub(totalShares));
      const unlockedMultiplier = UNLOCKSCHEDULE.amounts[2];
      let expectedReleased = ethers.BigNumber.from(expectedMint).mul(CAPTABLE.shares[0]).div(totalShares);
      expectedReleased = expectedReleased.mul(unlockedMultiplier).div(10 ** (await TheopetraFounderVesting.decimals()));
      const initialBalance = await TheopetraERC20Token.balanceOf(CAPTABLE.addresses[0]);

      await moveTimeForward(travelTime);

      await TheopetraFounderVesting.release(TheopetraERC20Token.address);
      const releasedBalance = await TheopetraERC20Token.balanceOf(CAPTABLE.addresses[0]);

      expect(initialBalance).to.equal(0);
      expect(releasedBalance).to.equal(expectedReleased);
    });
  });

  describe('releaseAmount', function () {
    beforeEach(async function () {
      TheopetraTreasury.setTheoBondingCalculator(BondingCalculatorMock.address);
      BondingCalculatorMock.setValuation(100_000_000);
      await users[1].Treasury.mint((await ethers.getSigners())[5].address, INITIALMINT);
      await TheopetraFounderVesting.initialMint();
      // move forward 1 hour past unlock schedule
      await moveTimeForward(UNLOCKSCHEDULE.times[UNLOCKSCHEDULE.times.length - 1] + 3600);
    });
    it('reverts if no shares designated to address', async function () {
      await expect(
        TheopetraFounderVesting.connect((await ethers.getSigners())[1]).releaseAmount(TheopetraERC20Token.address, 1)
      ).to.be.revertedWith('TheopetraFounderVesting: account has no shares');
    });
    it('reverts if amount is 0', async function () {
      await expect(TheopetraFounderVesting.releaseAmount(TheopetraERC20Token.address, 0)).to.be.revertedWith(
        'TheopetraFounderVesting: amount cannot be 0'
      );
    });
    it('reverts if no payment due to address', async function () {
      // clean out initial funds
      await TheopetraFounderVesting.release(TheopetraERC20Token.address);
      // Trying again should fail
      await expect(TheopetraFounderVesting.releaseAmount(TheopetraERC20Token.address, 1)).to.be.revertedWith(
        'TheopetraFounderVesting: account is not due payment'
      );
    });
    it('reverts if amount is greater than amount due', async function () {
      const reallyBigAmount = 1_000_000_000_000_000;
      await expect(
        TheopetraFounderVesting.releaseAmount(TheopetraERC20Token.address, reallyBigAmount)
      ).to.be.revertedWith('TheopetraFounderVesting: requested amount is more than due payment for account');
    });
    it('increases total released', async function () {
      const expectedReleased = 100;
      const initialReleased = await TheopetraFounderVesting.getTotalReleased(TheopetraERC20Token.address);

      await TheopetraFounderVesting.releaseAmount(TheopetraERC20Token.address, expectedReleased);
      const totalReleased = await TheopetraFounderVesting.getTotalReleased(TheopetraERC20Token.address);

      expect(initialReleased).to.equal(0);
      expect(totalReleased).to.equal(expectedReleased);
    });
    it('increases balance of address', async function () {
      const expectedReleased = 100;
      const initialBalance = await TheopetraERC20Token.balanceOf(CAPTABLE.addresses[0]);

      await TheopetraFounderVesting.releaseAmount(TheopetraERC20Token.address, expectedReleased);
      const releasedBalance = await TheopetraERC20Token.balanceOf(CAPTABLE.addresses[0]);

      expect(initialBalance).to.equal(0);
      expect(releasedBalance).to.equal(expectedReleased);
    });
    it('emits an event', async function () {
      const expectedReleased = 100;

      await expect(TheopetraFounderVesting.releaseAmount(TheopetraERC20Token.address, expectedReleased))
        .to.emit(TheopetraFounderVesting, 'ERC20PaymentReleased')
        .withArgs(TheopetraERC20Token.address, CAPTABLE.addresses[0], expectedReleased);
    });
  });

  describe('scheduled releaseAmount', function () {
    beforeEach(async function () {
      TheopetraTreasury.setTheoBondingCalculator(BondingCalculatorMock.address);
      BondingCalculatorMock.setValuation(100_000_000);
      await users[1].Treasury.mint((await ethers.getSigners())[5].address, INITIALMINT);
      await TheopetraFounderVesting.initialMint();
    });
    it('reverts if no payment due to address at deploy time', async function () {
      // Attempting release at time 0 should fail
      await expect(TheopetraFounderVesting.releaseAmount(TheopetraERC20Token.address, 100)).to.be.revertedWith(
        'TheopetraFounderVesting: account is not due payment'
      );
    });
    it('increases balance of address by full shares after full schedule', async function () {
      const expectedReleased = 100;
      const initialBalance = await TheopetraERC20Token.balanceOf(CAPTABLE.addresses[0]);
      await moveTimeForward(UNLOCKSCHEDULE.times[UNLOCKSCHEDULE.times.length - 1] + 3600);

      await TheopetraFounderVesting.releaseAmount(TheopetraERC20Token.address, expectedReleased);
      const releasedBalance = await TheopetraERC20Token.balanceOf(CAPTABLE.addresses[0]);

      expect(initialBalance).to.equal(0);
      expect(releasedBalance).to.equal(expectedReleased);
    });
    it('increases balance of address proportionally to the time in the schedule', async function () {
      const travelTime = UNLOCKSCHEDULE.times[2] + 3600;
      const expectedReleased = 100;
      const initialBalance = await TheopetraERC20Token.balanceOf(CAPTABLE.addresses[0]);

      await moveTimeForward(travelTime);

      await TheopetraFounderVesting.releaseAmount(TheopetraERC20Token.address, expectedReleased);
      const releasedBalance = await TheopetraERC20Token.balanceOf(CAPTABLE.addresses[0]);

      expect(initialBalance).to.equal(0);
      expect(releasedBalance).to.equal(expectedReleased);
    });
  });

  describe('getReleasable', function () {
    beforeEach(async function () {
      TheopetraTreasury.setTheoBondingCalculator(BondingCalculatorMock.address);
      BondingCalculatorMock.setValuation(100_000_000);
      await users[1].Treasury.mint((await ethers.getSigners())[5].address, INITIALMINT);
      await TheopetraFounderVesting.initialMint();
      // move forward 1 hour past unlock schedule
      await moveTimeForward(UNLOCKSCHEDULE.times[UNLOCKSCHEDULE.times.length - 1] + 3600);
    });
    it('reverts if no shares designated to address', async function () {
      await expect(TheopetraFounderVesting.getReleasable(TheopetraERC20Token.address, badAddress)).to.be.revertedWith(
        'TheopetraFounderVesting: account has no shares'
      );
    });
    it('returns 0 if no payment is due', async function () {
      await TheopetraFounderVesting.release(TheopetraERC20Token.address);
      const releasable = await TheopetraFounderVesting.getReleasable(
        TheopetraERC20Token.address,
        CAPTABLE.addresses[0]
      );
      expect(releasable).to.equal(ethers.constants.Zero);
    });
    it('returns quantity of releasable tokens if tokens are due', async function () {
      const totalBalance = await TheopetraERC20Token.balanceOf(TheopetraFounderVesting.address);
      const totalShares = CAPTABLE.shares.reduce((acc, curr) => acc.add(curr), ethers.constants.Zero);
      const expectedReleasable = totalBalance.mul(CAPTABLE.shares[0]).div(totalShares);

      const releasable = await TheopetraFounderVesting.getReleasable(
        TheopetraERC20Token.address,
        CAPTABLE.addresses[0]
      );
      expect(releasable).to.equal(expectedReleasable);
    });
  });

  describe('scheduled getReleasable', function () {
    beforeEach(async function () {
      TheopetraTreasury.setTheoBondingCalculator(BondingCalculatorMock.address);
      BondingCalculatorMock.setValuation(100_000_000);
      await users[1].Treasury.mint((await ethers.getSigners())[5].address, INITIALMINT);
      await TheopetraFounderVesting.initialMint();
    });
    it('returns balance of address with full shares after full schedule', async function () {
      const totalShares = CAPTABLE.shares.reduce((acc, curr) => acc.add(curr), ethers.constants.Zero);
      const expectedMint = totalShares
        .mul(INITIALMINT)
        .div(ethers.BigNumber.from(10 ** (await TheopetraFounderVesting.decimals())).sub(totalShares));
      const expectedReleasable = ethers.BigNumber.from(expectedMint).mul(CAPTABLE.shares[0]).div(totalShares);
      await moveTimeForward(UNLOCKSCHEDULE.times[UNLOCKSCHEDULE.times.length - 1] + 3600);

      const releasableBalance = await TheopetraFounderVesting.getReleasable(
        TheopetraERC20Token.address,
        CAPTABLE.addresses[0]
      );

      expect(releasableBalance).to.equal(expectedReleasable);
    });
    it('returns balance of address proportionally to the time in the schedule', async function () {
      const travelTime = UNLOCKSCHEDULE.times[2] + 3600;
      const totalShares = CAPTABLE.shares.reduce((acc, curr) => acc.add(curr), ethers.constants.Zero);
      const expectedMint = totalShares
        .mul(INITIALMINT)
        .div(ethers.BigNumber.from(10 ** (await TheopetraFounderVesting.decimals())).sub(totalShares));
      let expectedReleasable = ethers.BigNumber.from(expectedMint).mul(CAPTABLE.shares[0]).div(totalShares);
      const unlockedMultiplier = UNLOCKSCHEDULE.amounts[2];
      expectedReleasable = expectedReleasable
        .mul(unlockedMultiplier)
        .div(10 ** (await TheopetraFounderVesting.decimals()));

      await moveTimeForward(travelTime);

      const releasableBalance = await TheopetraFounderVesting.getReleasable(
        TheopetraERC20Token.address,
        CAPTABLE.addresses[0]
      );
      expect(releasableBalance).to.equal(expectedReleasable);
    });
  });

  describe('getFdvFactor', function () {
    beforeEach(async function () {
      await users[1].Treasury.mint((await ethers.getSigners())[5].address, INITIALMINT);
      await TheopetraFounderVesting.initialMint();
    });
    it('reverts when no bonding calculator is available', async function () {
      await expect(TheopetraFounderVesting.getFdvFactor()).to.be.revertedWith(
        'TheopetraFounderVesting: No bonding calculator'
      );
    });
    it('reverts when bonding calculator is address 0x00', async function () {
      const addressZero = await ethers.utils.getAddress('0x0000000000000000000000000000000000000000');
      await TheopetraTreasury.setTheoBondingCalculator(addressZero);
      await expect(TheopetraFounderVesting.getFdvFactor()).to.be.revertedWith(
        'TheopetraFounderVesting: No bonding calculator'
      );
    });
    it.only('to equal 1 (9 decimals) if the FDV target is hit', async function () {
      const expectedFdvFactor = 1_000_000_000;
      const NewBondingCalculatorMock = await ethers.getContract('NewBondingCalculatorMock');
      await TheopetraTreasury.setTheoBondingCalculator(NewBondingCalculatorMock.address);
      await NewBondingCalculatorMock.setPerformanceTokenAmount(100_000); // Equivalent to 0.1 USDC, 6 decimals

      const fdvFactor = await TheopetraFounderVesting.getFdvFactor();

      expect(fdvFactor).to.equal(expectedFdvFactor);
    });
    it.only('to equal proportional value (9 decimals) if the FDV target is not hit', async function () {
      const initialBalance = await TheopetraERC20Token.totalSupply();
      const expectedScalingFactor = 10**(9-6) // 9 Decimals for THEO, 6 for performanceToken (because in this case we are using USDC as performanceToken in mock bonding calculator)
      const testValuationValue = ethers.BigNumber.from(FDVTARGET)
        .mul(10 ** (await TheopetraFounderVesting.decimals()))
        .div(initialBalance)
        .sub(10_000);
      const scaledTestValuationMethod = testValuationValue.div(expectedScalingFactor);
      const expectedFdvFactor = scaledTestValuationMethod.mul(initialBalance).div(FDVTARGET);
      // TheopetraTreasury.setTheoBondingCalculator(BondingCalculatorMock.address);
      // BondingCalculatorMock.setValuation(testValuationValue);
      const NewBondingCalculatorMock = await ethers.getContract('NewBondingCalculatorMock');
      await TheopetraTreasury.setTheoBondingCalculator(NewBondingCalculatorMock.address);
      await NewBondingCalculatorMock.setPerformanceTokenAmount(scaledTestValuationMethod);

      const fdvFactor = await TheopetraFounderVesting.getFdvFactor();
      console.log('THIS FDV FACTOR', fdvFactor.toString(), expectedFdvFactor.toString());

      expect(fdvFactor).to.equal(expectedFdvFactor);
    });
  });
  describe('rebalance', function () {
    beforeEach(async function () {
      TheopetraTreasury.setTheoBondingCalculator(BondingCalculatorMock.address);
      BondingCalculatorMock.setValuation(100_000_000);
      await users[1].Treasury.mint((await ethers.getSigners())[5].address, INITIALMINT);
      await TheopetraFounderVesting.initialMint();
    });
    it('mints tokens to rebalance the founder shares to the expected ownership percentage', async function () {
      const totalShares = CAPTABLE.shares.reduce((acc, curr) => acc.add(curr), ethers.constants.Zero);
      const expectedInitialMint = totalShares
        .mul(INITIALMINT)
        .div(ethers.BigNumber.from(10 ** (await TheopetraFounderVesting.decimals())).sub(totalShares));
      const expectedRebalanceMint = totalShares
        .mul(INITIALMINT + 1_000_000)
        .div(ethers.BigNumber.from(10 ** (await TheopetraFounderVesting.decimals())).sub(totalShares));
      const initialBalance = await TheopetraERC20Token.balanceOf(TheopetraFounderVesting.address);

      await users[1].Treasury.mint(owner, 1_000_000);
      await TheopetraFounderVesting.rebalance();

      const postBalance = await TheopetraERC20Token.balanceOf(TheopetraFounderVesting.address);
      expect(postBalance - initialBalance).to.equal(expectedRebalanceMint.sub(expectedInitialMint));
    });
    it('burns tokens to rebalance the founder shares to the expected ownership percentage', async function () {
      const totalShares = CAPTABLE.shares.reduce((acc, curr) => acc.add(curr), ethers.constants.Zero);
      const expectedInitialMint = totalShares
        .mul(INITIALMINT)
        .div(ethers.BigNumber.from(10 ** (await TheopetraFounderVesting.decimals())).sub(totalShares));
      const expectedRebalanceMint = totalShares
        .mul(INITIALMINT - 1_000_000)
        .div(ethers.BigNumber.from(10 ** (await TheopetraFounderVesting.decimals())).sub(totalShares));
      const initialBalance = await TheopetraERC20Token.balanceOf(TheopetraFounderVesting.address);

      await TheopetraERC20Token.connect((await ethers.getSigners())[5]).burn(1_000_000);
      await TheopetraFounderVesting.rebalance();

      const postBalance = await TheopetraERC20Token.balanceOf(TheopetraFounderVesting.address);
      expect(postBalance - initialBalance).to.equal(expectedRebalanceMint.sub(expectedInitialMint));
    });
    it('does not burn or mint tokens if the supply remains the same', async function () {
      const initialBalance = await TheopetraERC20Token.balanceOf(TheopetraFounderVesting.address);

      await TheopetraFounderVesting.rebalance();

      const postBalance = await TheopetraERC20Token.balanceOf(TheopetraFounderVesting.address);
      expect(postBalance - initialBalance).to.equal(0);
    });
    it('does not mint tokens after one rebalance call after unlock schedule', async function () {
      // move forward 1 hour past unlock schedule
      await moveTimeForward(UNLOCKSCHEDULE.times[UNLOCKSCHEDULE.times.length - 1] + 3600);
      await TheopetraFounderVesting.rebalance();
      const initialBalance = await TheopetraERC20Token.balanceOf(TheopetraFounderVesting.address);

      await users[1].Treasury.mint(owner, 1_000_000_000);
      await TheopetraFounderVesting.rebalance();

      const postBalance = await TheopetraERC20Token.balanceOf(TheopetraFounderVesting.address);
      expect(postBalance - initialBalance).to.equal(0);
    });
    it('does not burn tokens after one rebalance call after unlock schedule', async function () {
      // move forward 1 hour past unlock schedule
      await moveTimeForward(UNLOCKSCHEDULE.times[UNLOCKSCHEDULE.times.length - 1] + 3600);
      await TheopetraFounderVesting.rebalance();
      const initialBalance = await TheopetraERC20Token.balanceOf(TheopetraFounderVesting.address);

      await TheopetraERC20Token.connect((await ethers.getSigners())[5]).burn(1_000_000);
      await TheopetraFounderVesting.rebalance();

      const postBalance = await TheopetraERC20Token.balanceOf(TheopetraFounderVesting.address);
      expect(postBalance - initialBalance).to.equal(0);
    });
  });
});
