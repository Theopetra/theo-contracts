import * as dotenv from 'dotenv';
import { ethers, getUnnamedAccounts } from 'hardhat';
import { NewBondingCalculatorMock__factory } from '../../typechain-types';
dotenv.config();

const newBondingCalculatorMockInfo = async () => {
  const provider = new ethers.providers.AlchemyProvider('rinkeby', process.env.ALCHEMY_API_KEY);
  const [owner] = await ethers.getSigners();

  const NewBondingCalculatorMock = NewBondingCalculatorMock__factory.connect(
    '0x1f802CAa9fE1EF4364A54e39162Ab985395A35BE',
    provider
  );

  const theoAddress = await NewBondingCalculatorMock.theo();
  console.log('THEO address>>>>>', theoAddress);

  // Set initial value for performance token, and check its value via `valutation` with THEO
  // await NewBondingCalculatorMock.connect(owner).setPerformanceTokenAmount(1000000000);
  const initialPerformanceTokenAmount = await NewBondingCalculatorMock.valuation(theoAddress, 1_000_000_000);
  console.log('Initial performance token amount>>>>>', initialPerformanceTokenAmount.toString());

  // Check that the performance token amount can be updated
  // await NewBondingCalculatorMock.connect(owner).updatePerformanceTokenAmount(125);
  // const newPerformanceTokenAmount = await NewBondingCalculatorMock.valuation(theoAddress, 1_000_000_000);
  const timeLastUpdated = await NewBondingCalculatorMock.timePerformanceTokenLastUpdated();
  // console.log('Updated performance token amount>>>>>', newPerformanceTokenAmount.toString());
  console.log('Time last updated>>>>', timeLastUpdated.toString());

  // Set Weth address on mock bonding calculator
  // await NewBondingCalculatorMock.connect(owner).setWethAddress('0xc778417E063141139Fce010982780140Aa0cD5Ab');
  console.log('WETH address>>>>>', await NewBondingCalculatorMock.weth());
  // await NewBondingCalculatorMock.connect(owner).setUsdcAddress('0x4dbcdf9b62e891a7cec5a2568c3f4faf9e8abe2b');
  console.log('USDC address>>>>>', await NewBondingCalculatorMock.usdc());
};

const getNewBondingCalculatorMockInfo = async () => {
  try {
    await newBondingCalculatorMockInfo();
  } catch (err) {
    console.log(err);
  }
};

getNewBondingCalculatorMockInfo();
