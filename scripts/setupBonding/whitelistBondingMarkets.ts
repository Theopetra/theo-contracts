import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import { WhitelistTheopetraBondDepository, IERC20__factory } from '../../typechain-types';
import { waitFor } from '../../test/utils';
import { CONTRACTS } from '../../utils/constants';
dotenv.config();

const createWhitelistBondingMarket = async () => {
  // Rinkeby setup
  // const provider = new ethers.providers.AlchemyProvider('rinkeby', process.env.ALCHEMY_API_KEY);
  // const usdcTokenRinkebyAddress = '0x4DBCdF9B62e891a7cec5A2568C3F4FAF9E8Abe2b';
  // const wethTokenRinkebyAddress = '0xc778417E063141139Fce010982780140Aa0cD5Ab';
  // const USDCToken = IERC20__factory.connect(usdcTokenRinkebyAddress, provider);
  // const WETHToken = IERC20__factory.connect(wethTokenRinkebyAddress, provider);
  // const usdcUsdRinkebyPriceFeedAddress = '0xa24de01df22b63d23Ebc1882a5E3d4ec0d907bFB';
  // const ethUsdRinkebyPriceFeedAddress = '0x8A753747A1Fa494EC906cE90E9f37563A8AF630e';

    // Ropsten setup
    const provider = new ethers.providers.InfuraProvider('ropsten', process.env.INFURA_API_KEY);
    const usdcTokenRopstenAddress = '0x07865c6E87B9F70255377e024ace6630C1Eaa37F';
    const wethTokenRopstenAddress = '0xc778417E063141139Fce010982780140Aa0cD5Ab';
    const USDCToken = IERC20__factory.connect(usdcTokenRopstenAddress, provider);
    const WETHToken = IERC20__factory.connect(wethTokenRopstenAddress, provider);
    // const usdcUsdRinkebyPriceFeedAddress = ;
    // const ethUsdRinkebyPriceFeedAddress = ;


  const capacity = '10000000000000000000000'; // 1e22
  const sixMonthFixedBondPrice = '60000000'; // 1e7; 0.01 USD per THEO (9 decimals)
  const twelveMonthFixedBondPrice = '30000000'; // 1e7; 0.01 USD per THEO (9 decimals)
  const eighteenMonthFixedBondPrice = '10000000'; // 1e7; 0.01 USD per THEO (9 decimals)
  const capacityInQuote = false;
  const fixedTerm = true;
  const timeToConclusion = 60 * 60 * 24 * 365; // seconds in 365 days
  const block = await ethers.provider.getBlock('latest');
  const conclusion = block.timestamp + timeToConclusion;
  const sixMonthVesting = 60 * 60 * 24 * 182 + 60 * 60 * 12; // seconds in 182.5 days
  const twelveMonthVesting = 60 * 60 * 24 * 365; // seconds in 365 days
  const eighteenMonthVesting = twelveMonthVesting + sixMonthVesting;

  const WhitelistBondDepository = <WhitelistTheopetraBondDepository>await ethers.getContract(CONTRACTS.whitelistBondDepo);

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

  // Closed above markets, as different fixed pricing is needed for testing
  // await waitFor(WhitelistBondDepository.connect(owner).close(0));
  // await waitFor(WhitelistBondDepository.connect(owner).close(1));
  // await waitFor(WhitelistBondDepository.connect(owner).close(2));
  // await waitFor(WhitelistBondDepository.connect(owner).close(3));
  // await waitFor(WhitelistBondDepository.connect(owner).close(4));
  // await waitFor(WhitelistBondDepository.connect(owner).close(5));

  // Market ID 6: Created USDC 6-month testing market
  // await waitFor(WhitelistBondDepository.connect(owner).create(
  //   USDCToken.address,
  //   usdcUsdRinkebyPriceFeedAddress,
  //   [capacity, sixMonthFixedBondPrice],
  //   [capacityInQuote, fixedTerm],
  //   [sixMonthVesting, conclusion]
  // ));

  // Market ID 7: Created WETH 6-month testing market
  // await waitFor(WhitelistBondDepository.connect(owner).create(
  //   WETHToken.address,
  //   ethUsdRinkebyPriceFeedAddress,
  //   [capacity, sixMonthFixedBondPrice],
  //   [capacityInQuote, fixedTerm],
  //   [sixMonthVesting, conclusion]
  // ));

  // Market ID 8: Created USDC 12-month testing market
  // await waitFor(WhitelistBondDepository.connect(owner).create(
  //   USDCToken.address,
  //   usdcUsdRinkebyPriceFeedAddress,
  //   [capacity, twelveMonthFixedBondPrice],
  //   [capacityInQuote, fixedTerm],
  //   [twelveMonthVesting, conclusion]
  // ));

  // Market ID 9: Created WETH 12-month testing market
  // await waitFor(WhitelistBondDepository.connect(owner).create(
  //   WETHToken.address,
  //   ethUsdRinkebyPriceFeedAddress,
  //   [capacity, twelveMonthFixedBondPrice],
  //   [capacityInQuote, fixedTerm],
  //   [twelveMonthVesting, conclusion]
  // ));

  // Market ID 10: Created USDC 18-month testing market
  // await waitFor(WhitelistBondDepository.connect(owner).create(
  //   USDCToken.address,
  //   usdcUsdRinkebyPriceFeedAddress,
  //   [capacity, eighteenMonthFixedBondPrice],
  //   [capacityInQuote, fixedTerm],
  //   [eighteenMonthVesting, conclusion]
  // ));

  // // Market ID 11: Created WETH 18-month testing market
  // await waitFor(WhitelistBondDepository.connect(owner).create(
  //   WETHToken.address,
  //   ethUsdRinkebyPriceFeedAddress,
  //   [capacity, eighteenMonthFixedBondPrice],
  //   [capacityInQuote, fixedTerm],
  //   [eighteenMonthVesting, conclusion]
  // ));


  const liveMarkets = await WhitelistBondDepository.liveMarkets();
  const liveMarketIds = liveMarkets.map((market) => {
    return market.toNumber();
  });
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
