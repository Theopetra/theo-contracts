import * as dotenv from 'dotenv';
import { ethers, getUnnamedAccounts } from 'hardhat';
import hre from 'hardhat';
import {
  TheopetraBondDepository,
  TheopetraBondDepository__factory,
  IERC20,
  IERC20__factory,
} from '../../typechain-types';
import { waitFor } from '../../test/utils';
import { CONTRACTS } from '../../utils/constants';
dotenv.config();

// Non-whitelisted (regular) bond depo:
const createMarket = async () => {
  // const [owner] = await ethers.getSigners();

  // Rinkeby setup
  // const provider = new ethers.providers.AlchemyProvider('rinkeby', process.env.ALCHEMY_API_KEY);
  // const usdcTokenRinkebyAddress = '0x4DBCdF9B62e891a7cec5A2568C3F4FAF9E8Abe2b';
  // const wethTokenRinkebyAddress = '0xc778417E063141139Fce010982780140Aa0cD5Ab';
  // const USDCToken = IERC20__factory.connect(usdcTokenRinkebyAddress, provider);
  // const WETHToken = IERC20__factory.connect(wethTokenRinkebyAddress, provider);

  // Ropsten setup
  // const provider = new ethers.providers.InfuraProvider('ropsten', process.env.INFURA_API_KEY);
  // const usdcTokenRopstenAddress = '0x07865c6E87B9F70255377e024ace6630C1Eaa37F';
  // const wethTokenRopstenAddress = '0xc778417E063141139Fce010982780140Aa0cD5Ab';
  // const USDCToken = IERC20__factory.connect(usdcTokenRopstenAddress, provider);
  // const WETHToken = IERC20__factory.connect(wethTokenRopstenAddress, provider);

  // Goerli setup
  // const provider = new ethers.providers.InfuraProvider('goerli', process.env.INFURA_API_KEY);
  // const usdcTokenGoerliAddress = '0xD87Ba7A50B2E7E660f678A895E4B72E7CB4CCd9C';
  // const wethTokenGoerliAddress = '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6';
  // const USDCToken = IERC20__factory.connect(usdcTokenGoerliAddress, provider);
  // const WETHToken = IERC20__factory.connect(wethTokenGoerliAddress, provider);

  //Theopetra Staging setup
  const provider = new ethers.providers.JsonRpcProvider('https://mainnet-fork-endpoint-x1gi.onrender.com');
  const address = "0x3A051657830B6baadD4523d35061A84eC7Ce636A";

    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [address],
      });

  const owner = provider.getSigner(address);
      
  const usdcTokenMainnetAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
  const wethTokenMainnetAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
  const USDCToken = IERC20__factory.connect(usdcTokenMainnetAddress, provider);
  const WETHToken = IERC20__factory.connect(wethTokenMainnetAddress, provider);

  // Check USDC balance
  // USDC has 6 Decimals
  const ownerBalance = await USDCToken.balanceOf(owner._address);
  console.log('Owner balance USDC >>>>>>', ownerBalance.toNumber());

  const BondDepository = <TheopetraBondDepository>await ethers.getContract(CONTRACTS.bondDepo, owner);

  // Arguments for creating market
  // const capacity = '10000000000000000000000'; // 1e22 -- Previously used for Rinkeby and Ropsten testnet deployments
  const capacity = '15000000000000000'; // 15e15
  const initialPrice = 4e8; // This value could be changed to adjust targetDebt (and thereby maxPayout and maxDebt) if desired
  const buffer = 1e4;
  const capacityInQuote = false;
  const fixedTerm = true;
  const timeToConclusion = 60 * 60 * 24 * 365; // seconds in 365 days
  // const vesting = 60 * 60 * 24 * 14; // seconds in 14 days
  // const bondRateFixed = 10_000_000; // 1% in decimal form (i.e. 0.01 with 9 decimals)
  // const maxBondRateVariable = 40_000_000; // 4% in decimal form (i.e. 0.04 with 9 decimals)
  const discountRateBond = 1_000_000; // 0.1% in decimal form
  const discountRateYield = 500_000; // 0.05% in decimal form
  const depositInterval = 60 * 60 * 8;// 8 hours
  const tuneInterval = 60 * 60 * 8;// 8 hours
  const block = await ethers.provider.getBlock('latest');
  const conclusion = block.timestamp + timeToConclusion;
  // const sixMonthVesting = 60 * 60 * 24 * 182 + 60 * 60 * 12; // seconds in 182.5 days
  const sixMonthVesting = 60; // seconds in 1 minute
  const sixMonthBondRatefixed = 50_000_000; // 5% in decimal form (i.e. 0.05 with 9 decimals)
  const sixMonthMaxBRV = 100_000_000; // 10% in decimal form (i.e. 0.1 with 9 decimals)
  // const twelveMonthVesting = 60 * 60 * 24 * 365; // seconds in 365 days
  const twelveMonthVesting = 60 * 5; // seconds in 5 minutes
  const twelveMonthBondRateFixed = 100_000_000; // 10% in decimal form
  const twelveMonthMaxBRV = 150_000_000; // 15% in decimal form
  // const eighteenMonthVesting = twelveMonthVesting + sixMonthVesting;
  const eighteenMonthVesting = twelveMonthVesting * 2;//10 minutes
  const eighteenMonthBondRateFixed = 150_000_000; // 15% in decimal form
  const eighteenMonthhMaxBRV = 200_000_000; // 20% in decimal form
  // Created a new market using now commented-out code below
  // Owner is current policy holder and therefore used as signer
  // await waitFor(BondDepository.create(
  //   USDCToken.address,
  //   [capacity, initialPrice, buffer],
  //   [capacityInQuote, fixedTerm],
  //   [vesting, conclusion],
  //   [bondRateFixed, maxBondRateVariable, discountRateBond, discountRateYield],
  //   [depositInterval, tuneInterval]
  // ));

  // Market was created above and now exists at index 0;
  // Closed market at id 0 (as not needed)
  // await waitFor(BondDepository.close(0));

  // Market ID 1: Created USDC 6-month testing market
  await waitFor(
    BondDepository.create(
      USDCToken.address,
      [capacity, initialPrice, buffer],
      [capacityInQuote, fixedTerm],
      [sixMonthVesting, conclusion],
      [sixMonthBondRatefixed, sixMonthMaxBRV, discountRateBond, discountRateYield],
      [depositInterval, tuneInterval]
    )
  );

  // Market ID 2: Created WETH 6-month testing market
  await waitFor(
    BondDepository.connect(owner).create(
      WETHToken.address,
      [capacity, initialPrice, buffer],
      [capacityInQuote, fixedTerm],
      [sixMonthVesting, conclusion],
      [sixMonthBondRatefixed, sixMonthMaxBRV, discountRateBond, discountRateYield],
      [depositInterval, tuneInterval]
    )
  );

  // Market ID 3: Created USDC 12-month testing market
  await waitFor(
    BondDepository.connect(owner).create(
      USDCToken.address,
      [capacity, initialPrice, buffer],
      [capacityInQuote, fixedTerm],
      [twelveMonthVesting, conclusion],
      [twelveMonthBondRateFixed, twelveMonthMaxBRV, discountRateBond, discountRateYield],
      [depositInterval, tuneInterval]
    )
  );

  // Market ID 4: Created WETH 12-month testing market
  await waitFor(
    BondDepository.connect(owner).create(
      WETHToken.address,
      [capacity, initialPrice, buffer],
      [capacityInQuote, fixedTerm],
      [twelveMonthVesting, conclusion],
      [twelveMonthBondRateFixed, twelveMonthMaxBRV, discountRateBond, discountRateYield],
      [depositInterval, tuneInterval]
    )
  );

  // Market ID 5: Created USDC 18-month testing market
    await waitFor(BondDepository.connect(owner).create(
    USDCToken.address,
    [capacity, initialPrice, buffer],
    [capacityInQuote, fixedTerm],
    [eighteenMonthVesting, conclusion],
    [eighteenMonthBondRateFixed, eighteenMonthhMaxBRV, discountRateBond, discountRateYield],
    [depositInterval, tuneInterval]
  ));

  // Market ID 6: Created WETH 18-month testing market
  await waitFor(BondDepository.connect(owner).create(
    WETHToken.address,
    [capacity, initialPrice, buffer],
    [capacityInQuote, fixedTerm],
    [eighteenMonthVesting, conclusion],
    [eighteenMonthBondRateFixed, eighteenMonthhMaxBRV, discountRateBond, discountRateYield],
    [depositInterval, tuneInterval]
  ));

  const liveMarkets = await BondDepository.liveMarkets();
  const liveMarketIds = liveMarkets.map((market) => {
    return market.toNumber();
  });
  console.log('These are live market Ids:', liveMarketIds);

  const allMarkets = await BondDepository.getMarkets();
  const allMarketIds = allMarkets.map((market) => {
    return market.toNumber();
  });
  console.log('These are all bond market Ids:', allMarketIds);
};

const bonding = async () => {
  try {
    await createMarket();
  } catch (err) {
    console.log(err);
  }
};

bonding();
