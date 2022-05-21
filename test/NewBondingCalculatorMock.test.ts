import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';
import { TheopetraERC20Token, TheopetraAuthority } from '../typechain-types';
import { setupUsers, waitFor } from './utils';
import { CONTRACTS, MOCKSWITHARGS, NEWBONDINGCALCULATORMOCK } from '../utils/constants';


const setup = deployments.createFixture(async () => {
  await deployments.fixture();
  const { deployer: owner } = await getNamedAccounts();
  const contracts = {
    NewBondingCalculatorMock: await ethers.getContract('NewBondingCalculatorMock'),
    TheopetraERC20Token: await ethers.getContract(CONTRACTS.theoToken)
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
    it('can return the valuation for the performance token', async function () {
      const {NewBondingCalculatorMock, TheopetraERC20Token} = await setup();

      // Set initial value for performance token
      const initialPerformanceTokenAmount = 1000000000;
      await NewBondingCalculatorMock.setPerformanceTokenAmount(initialPerformanceTokenAmount);

      const initialPrice = await NewBondingCalculatorMock.valuation(TheopetraERC20Token.address, 1_000_000_000);
      expect(initialPrice.toNumber()).to.equal(initialPerformanceTokenAmount);
    });
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

    it.skip('FOR TREASury can update the deltaToken price', async function() {})
  })
})
