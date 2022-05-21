import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';
import { TheopetraERC20Token, TheopetraAuthority } from '../typechain-types';
import { setupUsers, waitFor } from './utils';
import { CONTRACTS, MOCKS, MOCKSWITHARGS, NEWBONDINGCALCULATORMOCK } from '../utils/constants';


const setup = deployments.createFixture(async () => {
  await deployments.fixture();
  const { deployer: owner } = await getNamedAccounts();
  const contracts = {
    NewBondingCalculatorMock: await ethers.getContract('NewBondingCalculatorMock'),
    TheopetraERC20Token: await ethers.getContract(CONTRACTS.theoToken),
    Weth: await ethers.getContract(MOCKS.WETH9),
  };
  const users = await setupUsers(await getUnnamedAccounts(), contracts);
  return {
    ...contracts,
    users,
    owner,
  };
});

describe.only(NEWBONDINGCALCULATORMOCK, function () {
  describe('deployment', function () {
    it('can be deployed', async function () {
      await setup();
    })
  })

  describe('valuation', function () {
    it('can return the valuation for the performance token (for use in Treasury, via `tokenPerformanceUpdate`)', async function () {
      const {NewBondingCalculatorMock, TheopetraERC20Token} = await setup();

      // Set initial value for performance token
      const initialPerformanceTokenAmount = 1000000000;
      await NewBondingCalculatorMock.setPerformanceTokenAmount(initialPerformanceTokenAmount);

      const initialPrice = await NewBondingCalculatorMock.valuation(TheopetraERC20Token.address, 1_000_000_000);
      expect(initialPrice.toNumber()).to.equal(initialPerformanceTokenAmount);
    });

    it.only('can return the valuation for THEO (for use in bond depo, via `marketPrice`)', async function (){
      const {NewBondingCalculatorMock, Weth} = await setup();
      // Use same values as mock bonding calculator for Theo per Weth (4000 $ per WETH; 0.01 $ per THEO)
      const expectedTheoPerWeth = (4000 / 0.01) * 10**9 // In Theo decimals (9)

      // Set Weth address on mock bonding calculator
      await NewBondingCalculatorMock.setWethAddress(Weth.address);
      expect(await NewBondingCalculatorMock.weth()).to.equal(Weth.address);

      const wethAmount = (10**(await Weth.decimals())).toString(); // `marketPrice` calls valuation with 10**quoteTokenDecimals
      const theoPerWeth = await NewBondingCalculatorMock.valuation(Weth.address, wethAmount);
      expect(theoPerWeth.toString()).to.equal(expectedTheoPerWeth.toString());
    })

  })

  describe('setInitialMockPerformanceTokenAmount', async function () {
    it('can only be set by the governor', async function () {
      const {users} = await setup();
      const [,bob] = users;
      await expect(bob.NewBondingCalculatorMock.setPerformanceTokenAmount('100')).to.be.revertedWith('UNAUTHORIZED');
    })
  })

  describe('updatePerformanceTokenAmount', async function () {
    it('can only be called by the governor', async function () {
      const {users} = await setup();
      const [,bob] = users;
      await expect(bob.NewBondingCalculatorMock.setPerformanceTokenAmount(125)).to.be.revertedWith('UNAUTHORIZED');
    });

    it('can update the valuation for the performance token', async function () {
      const {NewBondingCalculatorMock, TheopetraERC20Token} = await setup();

      // Set initial value for performance token
      const initialPerformanceTokenAmount = 1000000000;
      await NewBondingCalculatorMock.setPerformanceTokenAmount(initialPerformanceTokenAmount);

      await NewBondingCalculatorMock.updatePerformanceTokenAmount(125);
      const updatedAmount = await NewBondingCalculatorMock.valuation(TheopetraERC20Token.address, 1_000_000_000);
      expect(updatedAmount.toNumber()).to.equal((initialPerformanceTokenAmount * 125 / 100) + initialPerformanceTokenAmount);
    });

  })
})
