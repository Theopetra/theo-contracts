import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import { IERC20__factory, PublicPreListBondDepository } from '../../typechain-types';
import { waitFor } from '../../test/utils';
import { CONTRACTS } from '../../utils/constants';
dotenv.config();

const createPublicPrelistBondingMarket = async () => {
  // Ropsten setup
  const provider = new ethers.providers.InfuraProvider('ropsten', process.env.INFURA_API_KEY);
  const usdcTokenRopstenAddress = '0x07865c6E87B9F70255377e024ace6630C1Eaa37F';
  const wethTokenRopstenAddress = '0xc778417E063141139Fce010982780140Aa0cD5Ab';
  const USDCToken = IERC20__factory.connect(usdcTokenRopstenAddress, provider);
  const WETHToken = IERC20__factory.connect(wethTokenRopstenAddress, provider);
  // As no Chainlink pricefeeds are available on Ropsten, the following addresses use mocks (these were simply deployed via remix),
  // These mocks return values that are based on a call to the pricefeeds available on Rinkeby
  const usdcUsdRopstenMockPriceFeedAddress = '0xc1656e185ED242c0aA3a20059Fcd311B0FF38D0A';
  const ethUsdRopstenMockPriceFeedAddress = '0xBcdF034cE6624A817c1BfEffBDE8691443e5fDbB';

  const capacity = '10000000000000000000000'; // 1e22
  const sixMonthFixedBondPrice = '150000000'; // 1.5e8; 0.15 USD per THEO (9 decimals)
  const twelveMonthFixedBondPrice = '60000000'; // 6e7; 0.06 USD per THEO (9 decimals)
  const eighteenMonthFixedBondPrice = '20000000'; // 2e7; 0.02 USD per THEO (9 decimals)
  const capacityInQuote = false;
  const fixedTerm = true;
  const timeToConclusion = 60 * 60 * 24 * 365; // seconds in 365 days
  const block = await ethers.provider.getBlock('latest');
  const conclusion = block.timestamp + timeToConclusion;
  const sixMonthVesting = 60 * 60 * 24 * 182 + 60 * 60 * 12; // seconds in 182.5 days
  const twelveMonthVesting = 60 * 60 * 24 * 365; // seconds in 365 days
  const eighteenMonthVesting = twelveMonthVesting + sixMonthVesting;

  const PublicPrelistBondDepo = <PublicPreListBondDepository>(
    await ethers.getContract(CONTRACTS.publicPreListBondDepo)
  );

  // // Market ID 0: Created USDC 6-month testing market
  // await waitFor(
  //   PublicPrelistBondDepo.create(
  //     USDCToken.address,
  //     usdcUsdRopstenMockPriceFeedAddress,
  //     [capacity, sixMonthFixedBondPrice],
  //     [capacityInQuote, fixedTerm],
  //     [sixMonthVesting, conclusion]
  //   )
  // );

  // // Market ID 1: Created WETH 6-month testing market
  // await waitFor(
  //   PublicPrelistBondDepo.create(
  //     WETHToken.address,
  //     ethUsdRopstenMockPriceFeedAddress,
  //     [capacity, sixMonthFixedBondPrice],
  //     [capacityInQuote, fixedTerm],
  //     [sixMonthVesting, conclusion]
  //   )
  // );

  // // Market ID 2: Created USDC 12-month testing market
  // await waitFor(
  //   PublicPrelistBondDepo.create(
  //     USDCToken.address,
  //     usdcUsdRopstenMockPriceFeedAddress,
  //     [capacity, twelveMonthFixedBondPrice],
  //     [capacityInQuote, fixedTerm],
  //     [twelveMonthVesting, conclusion]
  //   )
  // );

  // // Market ID 3: Created WETH 12-month testing market
  // await waitFor(
  //   PublicPrelistBondDepo.create(
  //     WETHToken.address,
  //     ethUsdRopstenMockPriceFeedAddress,
  //     [capacity, twelveMonthFixedBondPrice],
  //     [capacityInQuote, fixedTerm],
  //     [twelveMonthVesting, conclusion]
  //   )
  // );

  // // Market ID 4: Created USDC 18-month testing market
  // await waitFor(
  //   PublicPrelistBondDepo.create(
  //     USDCToken.address,
  //     usdcUsdRopstenMockPriceFeedAddress,
  //     [capacity, eighteenMonthFixedBondPrice],
  //     [capacityInQuote, fixedTerm],
  //     [eighteenMonthVesting, conclusion]
  //   )
  // );

  // // Market ID 5: Created WETH 18-month testing market
  // await waitFor(
  //   PublicPrelistBondDepo.create(
  //     WETHToken.address,
  //     ethUsdRopstenMockPriceFeedAddress,
  //     [capacity, eighteenMonthFixedBondPrice],
  //     [capacityInQuote, fixedTerm],
  //     [eighteenMonthVesting, conclusion]
  //   )
  // );

  const liveMarkets = await PublicPrelistBondDepo.liveMarkets();
  const liveMarketIds = liveMarkets.map((market) => {
    return market.toNumber();
  });
  console.log('These are live market Ids:', liveMarketIds);
};

const publicPrelistBonding = async () => {
  try {
    await createPublicPrelistBondingMarket();
  } catch (err) {
    console.log(err);
  }
};

publicPrelistBonding();
