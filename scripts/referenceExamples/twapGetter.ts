import * as dotenv from 'dotenv';
import { ethers, getUnnamedAccounts } from 'hardhat';
import { TwapGetter__factory } from '../../typechain-types';
dotenv.config();

const twapValuation = async () => {
  const provider = new ethers.providers.AlchemyProvider('rinkeby', process.env.ALCHEMY_API_KEY);

  // Call existing contract using contract's factory from typechain-types
  // Address can be found in the deployments/rinkeby folder
  const TwapGetter = TwapGetter__factory.connect(
    '0x926B798D6be996F6B9d25aDB9c15dc5359E958B6',
    provider
  );

  const tokenIn = "0x4DBCdF9B62e891a7cec5A2568C3F4FAF9E8Abe2b"; // Using Rinkeby USDC token address in place of THEO (as no THEO/PerformancToken pair exists yet)
  const amount = 1000000 // USDC has 6 decimals

  // Get the Time Weighted Average Price
  const twapValuation = await TwapGetter.valuation(tokenIn, amount);
  console.log("TWAP Valuation>>>>>", twapValuation.toString());
}

const getTwapValuation = async () => {
  try {
    await twapValuation();
  } catch (err) {
    console.log(err);
  }
};

getTwapValuation();
