import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import hre from 'hardhat';
import { IERC20__factory, PublicPreListBondDepository } from '../../typechain-types';
import { address, abi } from '../../deployments/mainnet/PublicPreListBondDepository.json';
import { waitFor } from '../../test/utils';
import { CONTRACTS } from '../../utils/constants';
dotenv.config();

const createPublicPrelistBondingMarket = async () => {
  // // Ropsten setup
  // const provider = new ethers.providers.InfuraProvider('ropsten', process.env.INFURA_API_KEY);
  // const usdcTokenRopstenAddress = '0x07865c6E87B9F70255377e024ace6630C1Eaa37F';
  // const wethTokenRopstenAddress = '0xc778417E063141139Fce010982780140Aa0cD5Ab';
  // const USDCToken = IERC20__factory.connect(usdcTokenRopstenAddress, provider);
  // const WETHToken = IERC20__factory.connect(wethTokenRopstenAddress, provider);
  // // As no Chainlink pricefeeds are available on Ropsten, the following addresses use mocks (these were simply deployed via remix),
  // // These mocks return values that are based on a call to the pricefeeds available on Rinkeby
  // const usdcUsdRopstenMockPriceFeedAddress = '0xc1656e185ED242c0aA3a20059Fcd311B0FF38D0A';
  // const ethUsdRopstenMockPriceFeedAddress = '0xBcdF034cE6624A817c1BfEffBDE8691443e5fDbB';

  // Goerli setup
  // const provider = new ethers.providers.InfuraProvider('goerli', process.env.INFURA_API_KEY);
  // const usdcTokenGoerliAddress = '0xD87Ba7A50B2E7E660f678A895E4B72E7CB4CCd9C';
  // const wethTokenGoerliAddress = '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6';
  // const USDCToken = IERC20__factory.connect(usdcTokenGoerliAddress, provider);
  // const WETHToken = IERC20__factory.connect(wethTokenGoerliAddress, provider);
  // As no Chainlink pricefeeds are available on Goerli, the following addresses use mocks (these were simply deployed via remix),
  // These mocks return values that are based on a call to the pricefeeds available on Rinkeby
  // const usdcUsdGoerliPriceFeedAddress = '0xd4293e0EBf6FE1Cc16F56A4707BEF2f38651d16f';
  // const ethUsdGoerliPriceFeedAddress = '0xF60AbA69463AC75231e742956F68577BFbC8B002';

  // Sepolia setup
  // const provider = new ethers.providers.InfuraProvider('sepolia', process.env.INFURA_API_KEY);
  // const usdcTokenGoerliAddress = '0x87E81A82b35232c1d6E4eFa2586363ed1cC04451';
  // const wethTokenGoerliAddress = '0x55c3D276bb119E83eB056660c6716d6946DED806';
  // const USDCToken = IERC20__factory.connect(usdcTokenGoerliAddress, provider);
  // const WETHToken = IERC20__factory.connect(wethTokenGoerliAddress, provider);
  // // As no Chainlink pricefeeds are available on Goerli, the following addresses use mocks (these were simply deployed via remix),
  // // These mocks return values that are based on a call to the pricefeeds available on Rinkeby
  // const usdcUsdSepoliaPriceFeedAddress = '0x9d8cB71B78D44ab6E3A5CFb1E5D2620E2Bcb7168';
  // const ethUsdSepoliaPriceFeedAddress = '0x0060681A5B0D2FA87D184d85FB66Bc1eFeC5097d';

  //Mainnet fork setup 
  const provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:8545/');
  const usdcTokenMainnetAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
  const wethTokenMainnetAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
  const USDCToken = IERC20__factory.connect(usdcTokenMainnetAddress, provider);
  const WETHToken = IERC20__factory.connect(wethTokenMainnetAddress, provider);
  const usdcUsdMainnetPriceFeedAddress = '0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6';
  const ethUsdMainnetPriceFeedAddress = '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419';

  // const capacity = '10000000000000000000000'; // 1e22 -- Previously used for Rinkeby and Ropsten testnet deployments
  const capacity = '10000000000000000000000000000000000000000'; // 1e40
  const sixMonthFixedBondPrice = '150000000'; // 1.5e8; 0.15 USD per THEO (9 decimals)
  const twelveMonthFixedBondPrice = '60000000'; // 6e7; 0.06 USD per THEO (9 decimals)
  const eighteenMonthFixedBondPrice = '20000000'; // 2e7; 0.02 USD per THEO (9 decimals)
  const capacityInQuote = false;
  const fixedTerm = true;
  const timeToConclusion = 60 * 60 * 24 * 365; // seconds in 365 days
  const block = await provider.getBlock('latest');
  console.log("Block:", block);
  console.log(provider.network.chainId);
  const conclusion = block.timestamp + timeToConclusion;
  const sixMonthVesting = 60; // seconds in 182.5 days
  const twelveMonthVesting = 120; // seconds in 365 days
  const eighteenMonthVesting = twelveMonthVesting + sixMonthVesting;

  // const PublicPrelistBondDepo = <PublicPreListBondDepository>await ethers.getContract(CONTRACTS.PublicPrelistBondDepo);
  //Impersonate permissioned Policy address
  const policy = "0x3A051657830B6baadD4523d35061A84eC7Ce636A";
  await hre.network.provider.request({ method: 'hardhat_impersonateAccount', params: [policy] });

  let signer = provider.getSigner(policy);

  const PublicPrelistBondDepo = <PublicPreListBondDepository>await ethers.getContractAt(abi, address, signer);

  

  // Market ID 0: Created USDC 6-month testing market
  await waitFor(
    PublicPrelistBondDepo.create(
      USDCToken.address,
      usdcUsdMainnetPriceFeedAddress,
      [capacity, sixMonthFixedBondPrice],
      [capacityInQuote, fixedTerm],
      [sixMonthVesting, conclusion]
    )
  );

  // Market ID 1: Created WETH 6-month testing market
  await waitFor(
    PublicPrelistBondDepo.create(
      WETHToken.address,
      ethUsdMainnetPriceFeedAddress,
      [capacity, sixMonthFixedBondPrice],
      [capacityInQuote, fixedTerm],
      [sixMonthVesting, conclusion]
    )
  );

  // Market ID 2: Created USDC 12-month testing market
  await waitFor(
    PublicPrelistBondDepo.create(
      USDCToken.address,
      usdcUsdMainnetPriceFeedAddress,
      [capacity, twelveMonthFixedBondPrice],
      [capacityInQuote, fixedTerm],
      [twelveMonthVesting, conclusion]
    )
  );

  // Market ID 3: Created WETH 12-month testing market
  await waitFor(
    PublicPrelistBondDepo.create(
      WETHToken.address,
      ethUsdMainnetPriceFeedAddress,
      [capacity, twelveMonthFixedBondPrice],
      [capacityInQuote, fixedTerm],
      [twelveMonthVesting, conclusion]
    )
  );

  // Market ID 4: Created USDC 18-month testing market
  await waitFor(
    PublicPrelistBondDepo.create(
      USDCToken.address,
      usdcUsdMainnetPriceFeedAddress,
      [capacity, eighteenMonthFixedBondPrice],
      [capacityInQuote, fixedTerm],
      [eighteenMonthVesting, conclusion]
    )
  );

  // Market ID 5: Created WETH 18-month testing market
  await waitFor(
    PublicPrelistBondDepo.create(
      WETHToken.address,
      ethUsdMainnetPriceFeedAddress,
      [capacity, eighteenMonthFixedBondPrice],
      [capacityInQuote, fixedTerm],
      [eighteenMonthVesting, conclusion]
    )
  );

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
