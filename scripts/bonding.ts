import * as dotenv from 'dotenv';
import { ethers, getUnnamedAccounts } from 'hardhat';
import { TheopetraBondDepository__factory, IERC20, IERC20__factory } from '../typechain-types';
dotenv.config();

// Note re whitelist bond depo:
// Whitelist bond depo market creation requires a `_priceFeed` argument, which is the address of the price consumer
// Note that no deployment is done within this repo for the PriceConsumer
// For the time being, this has simply been deployed to Rinkeby via Remix, at the address below
// const priceConsumerRinkebyAddress = "0x4a6057191E56647a10433A732611A4B45D9169D0";

// Non-whitelisted bond depo:
const createMarket = async () => {
  const provider = new ethers.providers.AlchemyProvider('rinkeby', process.env.ALCHEMY_API_KEY);
  const [owner, bob] = await ethers.getSigners();

  // USDC Token address Rinkeby
  const usdcTokenRinkebyAddress = '0x4DBCdF9B62e891a7cec5A2568C3F4FAF9E8Abe2b';
  const USDCToken = IERC20__factory.connect(usdcTokenRinkebyAddress, provider);
  // Check Bob's USDC balance
  // USDC has 6 Decimals
  const bobBalance = await USDCToken.balanceOf(bob.address);
  console.log('Bob balance USDC >>>>>>', bobBalance.toNumber());

  // Connect to Bond Depo contract
  const BondDepository = TheopetraBondDepository__factory.connect(
    '0x7130212e81e74db3BA13cE052B93a7E5F1Df00B3',
    provider
  );

  // Arguments for creating market
  const capacity = '10000000000000000000000'; // 1e22
  const initialPrice = 400e9; // This value could be changed to adjust targetDebt (and thereby maxPayout and maxDebt) if desired
  const buffer = 2e5;
  const capacityInQuote = false;
  const fixedTerm = true;
  const timeToConclusion = 60 * 60 * 24 * 180; // seconds in 180 days
  const vesting = 60 * 60 * 24 * 14; // seconds in 14 days
  const bondRateFixed = 10_000_000; // 1% in decimal form (i.e. 0.01 with 9 decimals)
  const maxBondRateVariable = 40_000_000; // 4% in decimal form (i.e. 0.04 with 9 decimals)
  const discountRateBond = 10_000_000; // 1% in decimal form (i.e. 0.01 with 9 decimals)
  const discountRateYield = 20_000_000; // 2% in decimal form (i.e. 0.02 with 9 decimals)
  const depositInterval = 60 * 60 * 24 * 30;
  const tuneInterval = 60 * 60;
  const block = await ethers.provider.getBlock('latest');
  const conclusion = block.timestamp + timeToConclusion;

  // Created a new market using now commented-out code below
  // Owner is current policy holder and therefore used as signer
  // await BondDepository.connect(owner).create(
  //   USDCToken.address,
  //   [capacity, initialPrice, buffer],
  //   [capacityInQuote, fixedTerm],
  //   [vesting, conclusion],
  //   [bondRateFixed, maxBondRateVariable, discountRateBond, discountRateYield],
  //   [depositInterval, tuneInterval]
  // );

  // Market was created above and now exists at index 0;
  const isBondMarketLive = await BondDepository.isLive(0);
  console.log('Is the Bond Market Live? >>>>>>', isBondMarketLive);
  const [, vestingLength, , bondRateFixedValue, maxBondRateVariableValue] = await BondDepository.terms(0);
  console.log(
    'Vesting Length and Bond Rate Fixed >>>',
    vestingLength,
    bondRateFixedValue.toNumber(),
    maxBondRateVariableValue.toNumber()
  );
};

const bonding = async () => {
  try {
    await createMarket();
  } catch (err) {
    console.log(err);
  }
};

bonding();
