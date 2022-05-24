import * as dotenv from 'dotenv';
import { ethers, getUnnamedAccounts } from 'hardhat';
import { WhitelistTheopetraBondDepository__factory, IERC20__factory } from '../../typechain-types';
import { waitFor } from '../../test/utils';
dotenv.config();

const createWhitelistBondingMarket = async () => {
  const provider = new ethers.providers.AlchemyProvider('rinkeby', process.env.ALCHEMY_API_KEY);
  const [owner] = await ethers.getSigners();

  // Arguments for creating market
  const usdcTokenRinkebyAddress = '0x4DBCdF9B62e891a7cec5A2568C3F4FAF9E8Abe2b';
  const wethTokenRinkebyAddress = '0xc778417E063141139Fce010982780140Aa0cD5Ab';
  const USDCToken = IERC20__factory.connect(usdcTokenRinkebyAddress, provider);
  const WETHToken = IERC20__factory.connect(wethTokenRinkebyAddress, provider);
  const usdcUsdRinkebyPriceFeedAddress = '0xa24de01df22b63d23Ebc1882a5E3d4ec0d907bFB';
  const ethUsdRinkebyPriceFeedAddress = '0x8A753747A1Fa494EC906cE90E9f37563A8AF630e';
  const capacity = '10000000000000000000000'; // 1e22
  const fixedBondPrice = '10000000'; // 1e7; 0.01 USD per THEO (9 decimals)
  const capacityInQuote = false;
  const fixedTerm = true;
  const timeToConclusion = 60 * 60 * 24 * 365; // seconds in 365 days
  const block = await ethers.provider.getBlock('latest');
  const conclusion = block.timestamp + timeToConclusion;
  const sixMonthVesting = (60 * 60 * 24 * 182) + (60 * 60 * 12) // seconds in 182.5 days
  const twelveMonthVesting = 60 * 60 * 24 * 365; // seconds in 365 days
  const eighteenMonthVesting = twelveMonthVesting + sixMonthVesting;

  // Connect to Bond Depo contract
  const WhitelistBondDepository = WhitelistTheopetraBondDepository__factory.connect(
    '0xbCF05b9993B5241C9F46F8a4C3459d423299D57D',
    provider
  );

  // Market ID 0: Created USDC 6-month testing market
  // await waitFor(WhitelistBondDepository.connect(owner).create(
  //   USDCToken.address,
  //   usdcUsdRinkebyPriceFeedAddress,
  //   [capacity, fixedBondPrice],
  //   [capacityInQuote, fixedTerm],
  //   [sixMonthVesting, conclusion]
  // ));

  // Market ID 1: Created WETH 6-month testing market
  // await waitFor(WhitelistBondDepository.connect(owner).create(
  //   WETHToken.address,
  //   ethUsdRinkebyPriceFeedAddress,
  //   [capacity, fixedBondPrice],
  //   [capacityInQuote, fixedTerm],
  //   [sixMonthVesting, conclusion]
  // ));

  // Market ID 2: Created USDC 12-month testing market
  // await waitFor(WhitelistBondDepository.connect(owner).create(
  //   USDCToken.address,
  //   usdcUsdRinkebyPriceFeedAddress,
  //   [capacity, fixedBondPrice],
  //   [capacityInQuote, fixedTerm],
  //   [twelveMonthVesting, conclusion]
  // ));

  // Market ID 3: Created WETH 12-month testing market
  // await waitFor(WhitelistBondDepository.connect(owner).create(
  //   WETHToken.address,
  //   ethUsdRinkebyPriceFeedAddress,
  //   [capacity, fixedBondPrice],
  //   [capacityInQuote, fixedTerm],
  //   [twelveMonthVesting, conclusion]
  // ));

  // Market ID 4: Created USDC 18-month testing market
  // await waitFor(WhitelistBondDepository.connect(owner).create(
  //   USDCToken.address,
  //   usdcUsdRinkebyPriceFeedAddress,
  //   [capacity, fixedBondPrice],
  //   [capacityInQuote, fixedTerm],
  //   [eighteenMonthVesting, conclusion]
  // ));

  // // Market ID 5: Created WETH 18-month testing market
  // await waitFor(WhitelistBondDepository.connect(owner).create(
  //   WETHToken.address,
  //   ethUsdRinkebyPriceFeedAddress,
  //   [capacity, fixedBondPrice],
  //   [capacityInQuote, fixedTerm],
  //   [eighteenMonthVesting, conclusion]
  // ));

  const liveMarkets = await WhitelistBondDepository.liveMarkets();
  const liveMarketIds = liveMarkets.map(market => {
    return market.toNumber();
  })
  console.log('These are live market Ids:', liveMarketIds);
};

const whitelistBonding = async () => {
  try {
    await createWhitelistBondingMarket();
  } catch (err) {
    console.log(err);
  }
};

whitelistBonding();
