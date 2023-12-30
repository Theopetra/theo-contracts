import hre, {ethers, network, tracer} from 'hardhat';
import {hexZeroPad} from 'ethers/lib/utils';
import helpers, {time} from '@nomicfoundation/hardhat-network-helpers';
import 'lodash.product';
import _ from 'lodash';
import {writeToStream} from "fast-csv";
import fs from 'fs';
import {
    ERC20__factory,
    IERC20__factory,
    STheopetra__factory,
    TheopetraBondDepository__factory,
    TheopetraTreasury__factory,
    TheopetraYieldReporter__factory,
    TheopetraERC20Token__factory,
    QuoterV2__factory,
    TheopetraERC20Token
} from '../../typechain-types';

import UNISWAP_SWAP_ROUTER_ABI from './UniswapSwapRouter.json';
import UNISWAP_POOL_ABI from './UniswapV3PoolAbi.json';
import UNISWAP_FACTORY_ABI from './NonFungiblePositionManager.json';
import THEOERC20_MAINNET_DEPLOYMENT from '../../deployments/mainnet/TheopetraERC20Token.json';
import MAINNET_YIELD_REPORTER from '../../deployments/mainnet/TheopetraYieldReporter.json';
import MAINNET_BOND_DEPO from '../../deployments/mainnet/TheopetraBondDepository.json';
import MAINNET_TREASURY_DEPLOYMENT from '../../deployments/mainnet/TheopetraTreasury.json';
import WETH9_ABI from './WETH9.json';
import {
    NonfungiblePositionManager,
    Pool,
    Position,
    Route,
    tickToPrice,
    Trade,
    SwapRouter,
    nearestUsableTick, TickMath, FeeAmount, SqrtPriceMath, AddLiquidityOptions

} from '@uniswap/v3-sdk';
import {BigintIsh, CurrencyAmount, Fraction, Percent, sqrt, Token, TradeType, WETH9, NativeCurrency } from '@uniswap/sdk-core';

import {waitFor} from "../../test/utils";
import {BigNumberish} from "ethers";
import JSBI from "jsbi";

const SWAP_ROUTER_ADDRESS = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";
const UNISWAP_POOL_ADDRESS = "0x1fc037ac35af9b940e28e97c2faf39526fbb4556";
const UNISWAP_NFPM = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';
const UNISWAP_FACTORY_ADDRESS = '0x1F98431c8aD98523631AE4a59f267346ea31F984';
const governorAddress = '0xb0D6fb365d04FbB7351b2C2796d895eBFDfC422A';
const policyAddress = '0x3a051657830b6baadd4523d35061a84ec7ce636a';
const managerAddress = '0xf4abccd90596c8d11a15986240dcad09eb9d6049';

const RPC_URL = process.env.ETH_NODE_URI_MAINNET;
const BLOCK_NUMBER = 18522741; // CHANGE ME
// const EPOCH_ROOT = 3 * 365 * 100; // 3 per day, 365 days per year, 100 years
const EPOCH_LENGTH = 8 * 60 * 60;
// const EPOCHS_PER_YIELD_REPORT = 3*30; // 3 per day, 30 days a month
const BOND_MARKET_ID = 0; // TODO: Get actual market ID
const EPOCH = 120; // Each epoch represents one month of activity
const sampleSize = 10; // # of simulation loops
const startingFunding = 100000; // Set initial funding here
let totalFunding: number;


const THEO_DECIMALS = 9;
const ETH_DECIMALS = 18;

const product = (_ as any).product; // stupid typescript doesn't recognize `product` on lodash >.>
const BigNumber = ethers.BigNumber;
const FixedNumber = ethers.FixedNumber;
const Contract = ethers.Contract;
let bondHistory: BigNumberish[] = [];

/*
    Buybacks are performed on a set interval based on the current yield
    tokenPerformanceUpdate is called on another interval to inform deltaTokenPrice within the TheopetraTreasury
    The bonding curve is calculated based on the current total THEO supply and the amount of time elapsed in simulation
    tokenPerformanceUpdate is called 3 * 30 times while buybacks are performed once for the same period
    a collection of transactions against the uniswap pool informs tokenPerformanceUpdate

    I. For each starting TVL in Uniswap Pool
        i. For each curve, funding rate, avg hold time
            1. Set price curve
            2. execute next buyback and burn
            3. for each EPOCH per buyback
                a. Generate a set of transactions to execute on uniswap pool
                b. Divide buying behaviour between growth market and LP
                c. Execute transactions against pool
                d. Execute tokenPerformanceUpdate
                e. Collect deltaTokenPrice, marketPrice, bondRateVariable, marketPrice, epoch number
                f. execute bond transaction
        ii. Reset Simulation State for next collection of parameters
 */

const USING_TENDERLY = false;
const JSON_RPC_URL = USING_TENDERLY ? 'https://rpc.tenderly.co/fork/9b04bcf4-0150-481b-8be9-a5a48779964c' : 'http://127.0.0.1:8545/';
const SET_BALANCE_RPC_CALL = USING_TENDERLY ? "tenderly_setBalance" : "hardhat_setBalance";

let quoter: any;

/*  Parameters
    startingTVL:    Adjusts the LP to the TVL in USD, with equal liquidity on each side
    fundingRate:    Controls monthly bond volume 
    avgHodl:        Adds bond volume to swap volume after x months
    variance:       Adjusts the randomness of generated transactions for bonds and swaps
    yieldReports:   -- should probably be replaced with a state variable based on total funding, yieldPer100k and time elapsed
    yieldPer100k:   Average RE yield based on 100k in funding
    exponent:       Base and time factor for the exponent in the pricing curve
    ethPrice:       Simulated ETH price in a given month
    sentiment:      Changes the mean direction of generated swaps. Sentiment of -1 is all sells, 1 is all buys.
*/

const parameters = {
    startingTVL: [500000],
    liquidityRatio: [
        [
            6746, // sqrtPriceX96 at slot0, squared then divided by 2 ^ 192, adjusted to THEO decimals and rounded down
            1
        ]
    ],
    fundingRate: [1000, 20000, 100000, 500000],
    avgHodl: [3, 12, 60],
    variance: [0.5, 1, 3, 5, 10],
    yieldReports: [
        [3336, 6673, 10009, 13346, 16682, 20020],
        [3336, 3336, 6673, 6673, 13346, 13346],
    ],
    yieldPer100k: [8000],
    exponent: [
        {base: 1, step: 0.1},
        {base: 2, step: 0.01},
    ],
    ethPrice: [
        [1600, 1614, 1622, 1606]
    ],
    sentiment: [0, 0.2, -0.2]
};

async function resetFork() {
    await network.provider.request({
        method: "hardhat_reset",
        params: [
            {
                forking: {
                    jsonRpcUrl: RPC_URL,
                    blockNumber: BLOCK_NUMBER,
                },
            },
        ],
    });

    const provider = new ethers.providers.JsonRpcProvider(JSON_RPC_URL);

    if (!USING_TENDERLY) {
        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [managerAddress],
        });

        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [governorAddress],
        });

        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [policyAddress],
        });

        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [MAINNET_TREASURY_DEPLOYMENT.address],
        });
    }

    await hre.network.provider.send(SET_BALANCE_RPC_CALL, [
        managerAddress,
        BigNumber.from(10).mul(BigNumber.from(10).pow(18)).toHexString(),
    ]);

    await hre.network.provider.send(SET_BALANCE_RPC_CALL, [
        policyAddress,
        BigNumber.from(10).mul(BigNumber.from(10).pow(18)).toHexString(),
    ]);

    await hre.network.provider.send(SET_BALANCE_RPC_CALL, [
        MAINNET_TREASURY_DEPLOYMENT.address,
        BigNumber.from(1_000_000).mul(BigNumber.from(10).pow(18)).toHexString(),
    ]);

    await hre.network.provider.send(SET_BALANCE_RPC_CALL, [
        governorAddress,
        BigNumber.from(100_000).mul(BigNumber.from(10).pow(18)).toHexString(),
    ]);


    const policySigner = provider.getSigner(policyAddress);
    const govSigner = provider.getSigner(governorAddress);

    if (!RPC_URL) throw Error("ETH_NODE_URI_MAINNET not set");
    // const TheopetraBondDepository = TheopetraBondDepository__factory.connect(MAINNET_BOND_DEPO.address, policySigner);


    /*
        Initialize bond market.
        Quote token is in wETH. Initial discount set at 5%, max discount at 20%.
        Total capacity is $6,000,000 in ETH over 1 year, at a deposit and tuning interval of 8 hours.
        The implied funding rate is $5,479.45 or roughly 3 ETH per 8 hour period. Volume lower than this will cause the discount rate to drop, above will cause it to rise.
    */

    // await TheopetraBondDepository.create(
    //     "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    //     [BigNumber.from("3334000000000000000000"), BigNumber.from(Math.floor(parameters.liquidityRatio[0][0] / parameters.liquidityRatio[0][1])), BigNumber.from(10000)],
    //     [true, true],
    //     [1209600, 1714092686],
    //     [500000, 20000000000, 0, 0],
    //     [28800, 28800]
    // );

    // console.log("Market created, active ids:", await TheopetraBondDepository.getMarkets());

    // refill ETH balance
    await hre.network.provider.send(SET_BALANCE_RPC_CALL, [
        governorAddress,
        BigNumber.from(100_000).mul(BigNumber.from(10).pow(18)).toHexString(),
    ]);

    const weth9 = new ethers.Contract(WETH9[1].address, WETH9_ABI.abi, govSigner);
    await weth9.deposit({ value: BigNumber.from(99_999).mul(BigNumber.from(10).pow(18)) });

    // Reset state variables
    totalFunding = startingFunding;
    bondHistory = [];
}

async function runAnalysis(loop: number, sampleSize: number) {
    await resetFork();

    tracer.enabled = true;

    const QuoterV2 = await ethers.getContractFactory('QuoterV2');
    // quoter = await QuoterV2.deploy(UNISWAP_FACTORY_ADDRESS, WETH9[1].address);
    quoter = QuoterV2.attach('0x61fFE014bA17989E743c5F6cB21bF9697530B21e');

    const provider = new ethers.providers.JsonRpcProvider(JSON_RPC_URL);

    if (!USING_TENDERLY) {
        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [managerAddress],
        });

        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [governorAddress],
        });

        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [policyAddress],
        });
    }


    await hre.network.provider.send(SET_BALANCE_RPC_CALL, [
        managerAddress,
        BigNumber.from(10).mul(BigNumber.from(10).pow(18)).toHexString(),
    ]);

    await hre.network.provider.send(SET_BALANCE_RPC_CALL, [
        policyAddress,
        BigNumber.from(10).mul(BigNumber.from(10).pow(18)).toHexString(),
    ]);

    await hre.network.provider.send(SET_BALANCE_RPC_CALL, [
        MAINNET_TREASURY_DEPLOYMENT.address,
        "0x8ac7230489e80000",
    ]);

    await hre.network.provider.send(SET_BALANCE_RPC_CALL, [
        governorAddress,
        BigNumber.from(100_000).mul(BigNumber.from(10).pow(18)).toHexString(),
    ]);


    const govSigner = provider.getSigner(governorAddress);
    const managerSigner = provider.getSigner(managerAddress);
    const policySigner = provider.getSigner(policyAddress);

    if (!RPC_URL) throw Error("ETH_NODE_URI_MAINNET not set");
    // const TheopetraYieldReporter = TheopetraYieldReporter__factory.connect(MAINNET_YIELD_REPORTER.address, managerSigner);
    // const TheopetraBondDepository = TheopetraBondDepository__factory.connect(MAINNET_BOND_DEPO.address, policySigner);

    const STheopetra = STheopetra__factory.connect(THEOERC20_MAINNET_DEPLOYMENT.address, govSigner);
    const TheopetraTreasury = TheopetraTreasury__factory.connect(MAINNET_TREASURY_DEPLOYMENT.address, govSigner);

    // four dimensional array
    // 1st dimension: yield reports
    // 2nd dimension: epochs per yield report
    // 3rd dimension: Transactions per epoch
    

    let runResults = [];
    const runSet = product(parameters.startingTVL, parameters.liquidityRatio, parameters.fundingRate, parameters.avgHodl, parameters.variance, parameters.yieldPer100k, parameters.exponent);
    const skipUntil = -1;

    for (const i in runSet) {
        if (parseInt(i) <= skipUntil) continue;
        const [startingTvl, liquidityRatio, fundingRate, avgHodl, variance, yieldPer100k, exponent, ethPrice, sentiment] = runSet[i];
        console.log("Run parameters:", runSet[i]);

        // Generate bond purchases
        const bondPurchases = range(EPOCH).map(() => generateBondPurchases(fundingRate, variance));

        // Set starting TVL
        await adjustUniswapTVLToTarget(startingTvl, liquidityRatio);

        //TODO: Add fixture for each unique startingTVL
        // Change time management to remove yield reports

        for (let j = 0; j < EPOCH; j++) {
            await executeBuybacks(yieldPer100k, ethPrice[j]);
                console.log(`Running Epoch ${j+1}/${EPOCH} in run ${parseInt(i)+1}/${runSet.length} of ${loop + 1}/${sampleSize} samples`);

                // a. Adjust ETH price 
                await adjustLiquidityToPrice(ethPrice[j]? ethPrice[j] : ethPrice[ethPrice.length], ethPrice[j-1]? ethPrice[j-1] : ethPrice[ethPrice.length], govSigner);

                // b. Get set of transactions to execute on uniswap pool
                const uniswapTxnsThisEpoch = await generateUniswapTransactions(ethPrice, variance, sentiment, govSigner);

                // c. Execute transactions against pool
                const swapData = await executeUniswapTransactions(uniswapTxnsThisEpoch, avgHodl, govSigner);

                // d. Execute tokenPerformanceUpdate
                await waitFor(TheopetraTreasury.tokenPerformanceUpdate());

                // e. Execute bond transactions
                const bondData = await executeBondTransactions(bondPurchases[j], govSigner, j, exponent);

                // f. Collect deltaTokenPrice, marketPrice, bondRateVariable, marketPrice, epoch number
                runResults.push({
                    runNumber: i,
                    startingTvl,
                    yieldPer100k,
                    yieldReportIdx: j, 
                    totalVolume: swapData.swapVolume,
                    buySellRatio: swapData.buySellRatio,
                    totalSwaps: swapData.totalSwaps,
                    totalDBVolume: bondData.bondVolume,
                    epochIdx: j,
                    deltaTokenPrice: await TheopetraTreasury.deltaTokenPrice(),
                    bondPrice: await getBondPrice(swapData.swapPrice, exponent, govSigner, 1),
                    marketPrice: swapData.swapPrice,
                });

                // fast-forward chain-time to next epoch
                await network.provider.send('evm_increaseTime', [EPOCH_LENGTH]);
        }

        saveResults(runResults, i);
        runResults = [];

        // reset fork
        await resetFork();
    }
}

async function main() {
    for (let i=0; i < sampleSize; i++) {
        try {
            console.log(`Running loop #${i}`);
            await runAnalysis(i, sampleSize);
        } catch (e) {
            console.log(e);
        }
    };
}

function boxMullerTransform() {
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    const z1 = Math.sqrt(-2.0 * Math.log(u1)) * Math.sin(2.0 * Math.PI * u2);
    return { z0, z1 };
}

interface Distribution {
    mean: number,
    stddev: number
}

function getNormallyDistributedRandomNumber({ mean, stddev }: Distribution) {
    const { z0 } = boxMullerTransform();
    return z0 * stddev + mean;
}

enum Direction {
    buy = "BUY",
    sell = "SELL"
}

async function generateUniswapTransactions(ethPrice: number, variance: number, sentiment: number, signer: any) {
    // Calculate daily volume based on 2% of market cap
    // 2% of market cap is an approximate average of daily volume of ETH, BTC, and comparable tokens
    const theoErc20 = new ethers.Contract(THEOERC20_MAINNET_DEPLOYMENT.address, THEOERC20_MAINNET_DEPLOYMENT.abi, signer);
    const poolInfo = await getPoolInfo();
    const theoSupply = await theoErc20.totalSupply();
    const theoPricePerEth = BigNumber.from(poolInfo.sqrtPriceX96).pow(2).mul(10**9).div(BigNumber.from(2).pow(192)).toString(); 
    const mcap = BigNumber.from(ethPrice).mul(theoSupply).div(theoPricePerEth).div(10**9).abs();
    const meanDailyVolume = (mcap.mul(2).div(100)).abs();

    const countDist: Distribution       = { mean: 30,    stddev: 1 };
    const valueDist: Distribution       = { mean: meanDailyVolume.toNumber(), stddev: meanDailyVolume.mul(variance * 10000).div(10000).toNumber() }; // If variance is ever lower than 0.01%... change this
    const directionDist: Distribution   = { mean: sentiment,    stddev: 1 }; // Gaussian distribution centered around 0, greater than 0 is BUY, less than 0 is SELL
    const txnCount = getNormallyDistributedRandomNumber(countDist);
    const txnValues = range(txnCount).map(() => Math.abs(getNormallyDistributedRandomNumber(valueDist)));
    const txnDirections = range(txnCount).map(() => getNormallyDistributedRandomNumber(directionDist) > 0 ? Direction.buy : Direction.sell);
    return range(txnCount).map(i => [txnValues[i], txnDirections[i]]);
}

function generateBondPurchases(fundingRate: number, variance: number) {
    const countDist: Distribution       = { mean: 5,    stddev: 0 };
    const valueDist: Distribution       = { mean: fundingRate / countDist.mean, stddev: fundingRate * variance };
    const txnCount = getNormallyDistributedRandomNumber(countDist);
    return range(txnCount).map(() => Math.abs(getNormallyDistributedRandomNumber(valueDist)));
}

async function adjustUniswapTVLToTarget(target: number, [ratioNumerator, ratioDenominator]: number[]) {
    //Impersonate Governor wallet and wrap ETH
    if (!USING_TENDERLY) await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [governorAddress],
    });

    const provider = new ethers.providers.JsonRpcProvider(JSON_RPC_URL);

    const ethPrice = BigNumber.from(1759); // TODO: query live price
    const govSigner = provider.getSigner(governorAddress);
    const uniswapV3Pool = new ethers.Contract(UNISWAP_POOL_ADDRESS, UNISWAP_POOL_ABI, govSigner);
    const uniswapV3Factory = new ethers.Contract(UNISWAP_NFPM, UNISWAP_FACTORY_ABI, govSigner);
    const token0Address = await uniswapV3Pool.token0();
    const token1Address = await uniswapV3Pool.token1();

    const token0 = ERC20__factory.connect(token0Address, govSigner);
    const token1 = ERC20__factory.connect(token1Address, govSigner);

    const token0symbol = await token0.symbol();
    const token1symbol = await token1.symbol();

    const weth = token0symbol === 'WETH' ? token0 : token1;
    const theo = token1symbol === 'WETH' ? token1 : token0;

    // const actualETHValueLocked = wethBalance.div(BigNumber.from(10).pow(ETH_DECIMALS)).mul(ethPrice);
    // half of liquidity is supplied with WETH
    const wethTarget = BigNumber.from(target/2).div(ethPrice).mul(BigNumber.from(10).pow(ETH_DECIMALS));
    const denom = BigNumber.from(1);

    const theoTargetNumerator = wethTarget.mul(BigNumber.from(ratioDenominator));
    const theoTargetDenominator = denom.mul(BigNumber.from(ratioNumerator));

    const theoTarget = theoTargetNumerator.div(theoTargetDenominator);
    //Impersonate treasury and mint THEO to Governor address
    if (!USING_TENDERLY) await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [MAINNET_TREASURY_DEPLOYMENT.address],
    });

    await hre.network.provider.send(SET_BALANCE_RPC_CALL, [
        governorAddress,
        ethers.utils.hexStripZeros(wethTarget.toHexString()),
    ]);

    await hre.network.provider.send(SET_BALANCE_RPC_CALL, [
        governorAddress,
        "0x152D02C7E14AF6800000",
    ]);

    await hre.network.provider.send(SET_BALANCE_RPC_CALL, [
        MAINNET_TREASURY_DEPLOYMENT.address,
        "0x8ac7230489e80000",
    ]);

    const treasurySigner = provider.getSigner(MAINNET_TREASURY_DEPLOYMENT.address);
    const theoERC20 = new ethers.Contract(THEOERC20_MAINNET_DEPLOYMENT.address, THEOERC20_MAINNET_DEPLOYMENT.abi, treasurySigner);
    await theoERC20.mint(governorAddress, BigNumber.from(theoTarget.add(theoTarget.div(10))));
    //mintTheoToSigners(signer, treasurySigner);

    const weth9 = new ethers.Contract(WETH9[1].address, WETH9_ABI.abi, govSigner);

    await weth9.deposit({ value: wethTarget.add(wethTarget.div(10)) });

    // /*  
    //     Token IDs are reported in Transfer events from the Uniswap factory address, 
    //     but don't indicate the pool they belong to.

    //     Mint events in the pool contract are delegated through the factory contract, 
    //     but the sender can be found through the transaction logs for the event.

    //     By filtering for the Mint events, accessing the tx hash property and querying the transaction, 
    //     we can find the sender address and use it to filter transfer events in the factory contract to list all LP position token IDs for the given pool.
    // */
   
    // const mintFilter = {
    //     address: UNISWAP_POOL_ADDRESS,
    //     topics: [
    //         '0x7a53080ba414158be7ec69b987b5fb7d07dee101fe85488f0853ae16239d0bde',
    //     ],
    //     fromBlock: 15460378
    // }

    const deadline = await time.latest() + 28800;
    // const logs = await provider.getLogs(mintFilter);
    // const txs = await Promise.all(logs.map((log) => (provider.getTransaction(log.transactionHash))));
    // const fromAddrs = await Promise.all(txs.map(async (transaction) => transaction.from));
    // const eventsList = await Promise.all(fromAddrs.map(fromAddr => {
    //     const transferFilter = {
    //         address: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    //         topics: [
    //             '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
    //             null,
    //             hexZeroPad(fromAddr, 32)],
    //         fromBlock: 15460379
    //     };
    //     return provider.getLogs(transferFilter);
    // }));

    // // eventsList.forEach(item => console.log(item.toString()));
    // const tokenIds = await Promise.all(eventsList.map(async (event) => Promise.all(event.map(async (event) => event.topics[3]))));
    // await removeAllLiquidity(tokenIds, fromAddrs, govSigner, deadline);

    const uniswapPool = new ethers.Contract(UNISWAP_POOL_ADDRESS, UNISWAP_POOL_ABI, govSigner);
    const liquidity = await uniswapPool.liquidity();
    console.log(`Liquidity in pool: ${liquidity}`);

    const calldatas = [];

    calldatas.push(
        //Once pool is empty, call mint to create new position across the full range with the target liquidity
        NonfungiblePositionManager.INTERFACE.encodeFunctionData('mint', [
            {
                token0: WETH9[1].address,
                token1: THEOERC20_MAINNET_DEPLOYMENT.address,
                fee: 10000,
                tickLower: -887200,
                tickUpper: 887200,
                amount0Desired: toHex(wethTarget.toString()),
                amount1Desired: toHex(theoTarget.toString()),
                amount0Min: toHex(0),
                amount1Min: toHex(0),
                recipient: governorAddress,
                deadline
            }
        ])
    )

    await weth9.connect(govSigner).approve(uniswapV3Factory.address, wethTarget);
    await theoERC20.connect(govSigner).approve(uniswapV3Factory.address, theoTarget);
    await uniswapV3Factory.multicall(calldatas);
}

// async function removeAllLiquidity(tokenIds: string[][], fromAddrs: string[], signer: any, deadline: number) {
//     const UNISWAP_NFPM_CONTRACT = new ethers.Contract(UNISWAP_NFPM, UNISWAP_FACTORY_ABI, signer);
//     const UNISWAP_POOL_CONTRACT = new ethers.Contract(UNISWAP_POOL_ADDRESS, UNISWAP_POOL_ABI, signer);
//     const provider = new ethers.providers.JsonRpcProvider(JSON_RPC_URL);

//     for (let i = 0; i < tokenIds.length; i++) {
//         for (let j = 0; j < tokenIds[i].length; j++) {
//             const id = tokenIds[i][j];
//             const positionInfo = await UNISWAP_NFPM_CONTRACT.positions(id);
//             const poolInfo = await getPoolInfo();

//             if (positionInfo.liquidity > 0 && (positionInfo.token0 == THEOERC20_MAINNET_DEPLOYMENT.address || positionInfo.token1 == THEOERC20_MAINNET_DEPLOYMENT.address)) {
//                 if (!USING_TENDERLY) await hre.network.provider.request({
//                     method: "hardhat_impersonateAccount",
//                     params: [fromAddrs[i]],
//                 });

//                 const impersonatedSigner = provider.getSigner(fromAddrs[i]);

//                 const calldata = [];
//                 // const fee = 10000;
//                 const t0 = WETH9[1];
//                 const t1 = new Token(1, THEOERC20_MAINNET_DEPLOYMENT.address, 9, 't1', 'THEO');

//                 const liquidity = positionInfo.liquidity.toString();
//                 const tickLower = Number(positionInfo.tickLower.toString());
//                 const tickUpper = Number(positionInfo.tickUpper.toString());
//                 const fee = positionInfo.fee;

//                 const pool = new Pool(t0, t1, fee, poolInfo.sqrtPriceX96.toString(), poolInfo.liquidity.toString(), poolInfo.tick);
//                 const position = new Position({ pool, liquidity, tickLower, tickUpper });

//                 const p0 = NonfungiblePositionManager.removeCallParameters(
//                     position,
//                     {
//                         tokenId: id,
//                         liquidityPercentage: new Percent(1, 1),
//                         slippageTolerance: new Percent(1, 1),
//                         deadline,
//                         collectOptions: {
//                             expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(t0, '170141183460469231731687303715884105727'),
//                             expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(t1, '170141183460469231731687303715884105727'),
//                             recipient: fromAddrs[i]
//                         }
//                     }
//                 );
                
//                 await UNISWAP_NFPM_CONTRACT
//                     .connect(impersonatedSigner)
//                     .multicall([p0.calldata]);
//             }
//         }
//     }
// }

// Function to encode a single value based on its type
function encodeValue(element: any) {
    return ethers.utils.defaultAbiCoder.encode([element.type], [element.value]);
}

async function executeUniswapTransactions(transactions: Array<Array<(number|Direction)>>, avgHodl: number, signer: any) {

    const recipient = await signer.getAddress();
    const provider = new ethers.providers.JsonRpcProvider(JSON_RPC_URL);
    const signatore = await provider.getSigner(recipient);
    const uniswapV3Router = new ethers.Contract(SWAP_ROUTER_ADDRESS, UNISWAP_SWAP_ROUTER_ABI, signatore);
    quoter = QuoterV2__factory.connect('0x61fFE014bA17989E743c5F6cB21bF9697530B21e', signatore);

    //Sum all generated swap transactions into one aggregate transaction, subtract fee % to account for price impact
    const buySwapSize = transactions.map((tx) => tx[1] === Direction.buy ? tx[0] as number : 0).reduce((p, c) => (p + Math.floor(c * 0.99)), 0);
    const sellSwapSize = transactions.map((tx) => tx[1] === Direction.sell ? tx[0] as number : 0).reduce((p, c) => (p + Math.floor(c * 0.99)), 0);
    const buyCount = transactions.reduce((p, c) => ( c[1] === Direction.buy ? p + 1 : p), 0);
    const bondsToSell = BigNumber.from(bondHistory[bondHistory.length - avgHodl]? bondHistory[bondHistory.length - avgHodl] : 0);
    let value = Math.abs(buySwapSize - sellSwapSize);
    console.log("Swap sizes:", buySwapSize, sellSwapSize, value);

    const signerAddress = await signer.getAddress();
    const tokenIn = buySwapSize > sellSwapSize ? WETH9[1].address : THEOERC20_MAINNET_DEPLOYMENT.address;
    const tokenOut = buySwapSize > sellSwapSize ? THEOERC20_MAINNET_DEPLOYMENT.address : WETH9[1].address;
    const tokenInDecimals = buySwapSize > sellSwapSize ? ETH_DECIMALS : THEO_DECIMALS;
    const tokenOutDecimals = buySwapSize > sellSwapSize ? THEO_DECIMALS : ETH_DECIMALS;
    const Erc20 =  buySwapSize > sellSwapSize ?  IERC20__factory.connect(WETH9[1].address, signer) : IERC20__factory.connect(THEOERC20_MAINNET_DEPLOYMENT.address, signer);

    const fee = 10000;
    const deadline = await time.latest() + 28800;
    const erc20Balance = await Erc20.balanceOf(signerAddress);
    const slot0 = (await getPoolInfo()).slot0;

    //TODO: Normalize value to tokenIn, value is in dollar equivalent 

    //Handle 0 case
    if (value == 0) {
        return {
        swapVolume: buySwapSize + sellSwapSize,
        buySellRatio: buyCount / transactions.length,
        totalSwaps: transactions.length,
        swapPrice: slot0.sqrtPriceX96.pow(2).div(2^192).mul(10**9)
        }
    };

    if (buySwapSize > sellSwapSize + bondsToSell?.toNumber()) {
        const amountOut = ethers.utils.parseUnits(value.toFixed(tokenOutDecimals), tokenOutDecimals); //.mul(BigNumber.from(10).pow(tokenOutDecimals));
        const { amountIn }  = await quoter.callStatic.quoteExactOutputSingle({tokenIn, tokenOut, amount: amountOut, fee, sqrtPriceLimitX96: 0 }); 
        const {
            amountOut: newOut,
            sqrtPriceX96After,
        } = await quoter.callStatic.quoteExactInputSingle({
            tokenIn,
            tokenOut,
            amountIn,
            fee,
            sqrtPriceLimitX96: 0
        });

        if (amountIn.gt(erc20Balance)) {
            await hre.network.provider.send(SET_BALANCE_RPC_CALL, [
                signerAddress,
                BigNumber.from(100_010).mul(BigNumber.from(10).pow(18)).toHexString(),
            ]);

            await wait(200);

            const weth9 = new ethers.Contract(WETH9[1].address, WETH9_ABI.abi, signer);
            await weth9.deposit({ value: BigNumber.from(100_000).mul(BigNumber.from(10).pow(18)) });
        }

        const params = {
            tokenIn,
            tokenOut,
            fee: BigNumber.from(fee),
            recipient,
            deadline: BigNumber.from(deadline),
            amountIn,
            amountOutMinimum: amountOut,
            sqrtPriceLimitX96: toHex(sqrtPriceX96After.toString()),
        };

        await waitFor(Erc20.approve(uniswapV3Router.address, amountIn));
        await waitFor(uniswapV3Router.exactInputSingle(params, { gasLimit: 1000000 }));

    } else {
        const amountIn = ethers.utils.parseUnits((value + bondsToSell?.toNumber()).toFixed(tokenInDecimals), tokenInDecimals);

        const {
            amountOut,
            sqrtPriceX96After,
        } = await quoter.callStatic.quoteExactInputSingle({
            tokenIn,
            tokenOut,
            amountIn,
            fee,
            sqrtPriceLimitX96: 0
        });

        const params = {
            tokenIn,
            tokenOut,
            fee: BigNumber.from(fee),
            recipient,
            deadline: BigNumber.from(deadline),
            amountIn,
            amountOutMinimum: amountOut,
            sqrtPriceLimitX96: toHex(sqrtPriceX96After.toString()),
        };

        if (amountIn.gt(erc20Balance)) {
            console.log("insufficient THEO balance to sell for ETH");
        }

        try {
            await waitFor(Erc20.approve(uniswapV3Router.address, amountIn));
            await waitFor(uniswapV3Router.exactInputSingle(params, { gasLimit: 1000000 }));
        } catch (e) {
            console.log(e);
            console.log("potentially insufficient THEO balance to sell for ETH");
        }
    }
    
    return {
        swapVolume: buySwapSize + sellSwapSize,
        buySellRatio: buyCount / transactions.length,
        totalSwaps: transactions.length,
        swapPrice: slot0.sqrtPriceX96.pow(2).div(2^192).mul(10**9)
    }
}

// async function executeBondTransactions(transactions: number[], signer: any) {
//     const ERC20 = IERC20__factory.connect(WETH9[1].address, signer);

//     const value = transactions.reduce((p, c) => (p + c), 0);

//     const TheopetraBondDepository = TheopetraBondDepository__factory.connect(MAINNET_BOND_DEPO.address, signer);
//     const signerAddress = await signer.getAddress();
//     // TODO: Figure out a sensible value for maxPrice
//     const maxPrice = BigNumber.from(1).mul(BigNumber.from(10).pow(18));
//     try {
//         const theoToBond = ethers.utils.parseUnits(value.toFixed(9), 9);
//         await waitFor(ERC20.approve(TheopetraBondDepository.address, theoToBond));
//         await waitFor(TheopetraBondDepository.deposit(BOND_MARKET_ID, theoToBond, maxPrice, signerAddress, signerAddress, false));
//     } catch (e) {
//         console.log(e);
//         const currentBalance = await ERC20.balanceOf(signerAddress);
//         console.log("currentBalance", currentBalance.toString());
//         console.log("theoToBond", value.toString());
//     }
//     return {
//         bondVolume: value
//     }
// }

async function executeBondTransactions(transactions: number[], signer: any, epoch: number, exponent: number) {
    const TheopetraTreasury = TheopetraTreasury__factory.connect(MAINNET_TREASURY_DEPLOYMENT.address, signer);
    const THEOerc = IERC20__factory.connect(THEOERC20_MAINNET_DEPLOYMENT.address, signer);
    const uniswapV3Router = new ethers.Contract(SWAP_ROUTER_ADDRESS, UNISWAP_SWAP_ROUTER_ABI, signer);
    const WETH9erc = IERC20__factory.connect(WETH9[1].address, signer);
    quoter = QuoterV2__factory.connect('0x61fFE014bA17989E743c5F6cB21bF9697530B21e', signer);
    
    const signerAddress = await signer.getAddress();
    const poolInfo = await getPoolInfo()
    const ethLiquidity = await WETH9erc.balanceOf("0x1fc037ac35af9b940e28e97c2faf39526fbb4556");
    const theoLiquidity = await THEOerc.balanceOf("0x1fc037ac35af9b940e28e97c2faf39526fbb4556");

    const totalValue = Math.floor(transactions.reduce((p, c) => (p + c), 0));
    console.log("Values: ", ethLiquidity, theoLiquidity, totalValue)
    let priceInEth = poolInfo.slot0.sqrtPriceX96.pow(2).mul(10**9).div(BigNumber.from(2).pow(192));
    console.log("Price: ", priceInEth, poolInfo.slot0);
    const maxTheoAmount = Math.floor(totalValue) * priceInEth;
    const maxBondPrice = await getBondPrice(priceInEth, exponent, signer, maxTheoAmount); 
    let priceImpact = BigNumber.from(1).sub(ethLiquidity.div(BigNumber.from(poolInfo.liquidity).div(theoLiquidity.sub(maxTheoAmount)))); 
    let theoToBond = 0;
    let theoSwap = BigNumber.from(0);

    console.log("Price impact:", priceImpact, "Bond Price: ", maxBondPrice, "Total value: ", totalValue, "Theo Amount: ", maxTheoAmount)
    
    // Behaviour tree
    // If the price to bond is lower than the swap price, then bond. If not, then swap. 
    // If equal, split 50/50. Else, split proportionally according to price impact. 
    
    // Check if the full amount can be bonded below market price, accounting for price impact
    if (BigNumber.from(1).sub(priceInEth.div(maxBondPrice)) > priceImpact && 
        priceImpact.add(1).mul(priceInEth).mul(totalValue) > maxBondPrice.mul(totalValue) ) {
            theoToBond = totalValue;
    } else {
        for (const i of transactions) {
            try {
                // Calculate new price
                priceImpact = BigNumber.from(1).sub(ethLiquidity.div(BigNumber.from(poolInfo.liquidity).div(theoLiquidity.sub(theoSwap))));
                priceInEth = poolInfo.slot0.sqrtPriceX96.pow(2).div(2^192).mul(10**9).mul(priceImpact);

                // Check if bond price is less than the current swap price
                if (priceInEth > getBondPrice(priceInEth, exponent, signer, transactions[i])) {
                    theoToBond += transactions[i];
                } else {
                    // Add to swap total
                    theoSwap.add(ethers.utils.parseUnits(transactions[i].toString(), 9));
                }
            } catch (e) {
                console.log(transactions[i]);
            }
        }
    }

    // Execute transactions with final amounts
    try {
        if (theoToBond > 0) {
            const bondAmount = ethers.utils.parseUnits(theoToBond.toString(), 9);
            await waitFor(TheopetraTreasury.mint(signerAddress, bondAmount));
            bondHistory.push(theoToBond);
            totalFunding += theoToBond;
        } 
        if (theoSwap.gt(0)) {
            const Erc20 = IERC20__factory.connect(WETH9[1].address, signer);
            const tokenIn = WETH9[1].address;
            const tokenOut = THEOERC20_MAINNET_DEPLOYMENT.address;
            const amountOut = ethers.utils.parseUnits(theoSwap.toString(), 9);
            const erc20Balance = await Erc20.balanceOf(signerAddress);
            const deadline = await time.latest() + 28800;
            const { amountIn }  = await quoter.callStatic.quoteExactOutputSingle({tokenIn, tokenOut, amount: amountOut, fee: 10000, sqrtPriceLimitX96: 0 });
            const {
                amountOut: newOut,
                sqrtPriceX96After,
            } = await quoter.callStatic.quoteExactInputSingle({
                tokenIn,
                tokenOut,
                amountIn,
                fee: 10000,
                sqrtPriceLimitX96: 0
            });

            if (amountIn.gt(erc20Balance)) {
                await hre.network.provider.send(SET_BALANCE_RPC_CALL, [
                    signerAddress,
                    BigNumber.from(100_010).mul(BigNumber.from(10).pow(18)).toHexString(),
                ]);

                await wait(200);

                const weth9 = new ethers.Contract(WETH9[1].address, WETH9_ABI.abi, signer);
                await weth9.deposit({ value: BigNumber.from(100_000).mul(BigNumber.from(10).pow(18)) });
            }

            const params = {
                tokenIn,
                tokenOut,
                fee: BigNumber.from(10000),
                recipient: signer._address,
                deadline: BigNumber.from(deadline),
                amountIn,
                amountOutMinimum: amountOut,
                sqrtPriceLimitX96: toHex(sqrtPriceX96After.toString()),
            };

            await waitFor(Erc20.approve(uniswapV3Router.address, amountIn));
            await waitFor(uniswapV3Router.exactInputSingle(params, { gasLimit: 1000000 }));
        }
        
    } catch (e) {
        console.log(e);
        const currentBalance = await THEOerc.balanceOf(signerAddress);
        console.log("currentBalance", currentBalance.toString());
        console.log("theoToBond", totalValue.toString());
    }
    return {
        bondVolume: theoToBond,
        swapVolume: theoSwap
    }
}

async function executeBuybacks(yieldPer100k: number, ethPrice: number) {
    //Set up treasury signer 
    if (!USING_TENDERLY) {
        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [MAINNET_TREASURY_DEPLOYMENT.address],
        });
    }

    const provider = new ethers.providers.JsonRpcProvider(JSON_RPC_URL);
    const recipient = await provider.getSigner(MAINNET_TREASURY_DEPLOYMENT.address);
    const uniswapV3Router = new ethers.Contract(SWAP_ROUTER_ADDRESS, UNISWAP_SWAP_ROUTER_ABI, recipient);
    const tokenIn = WETH9[1].address;
    const tokenOut = THEOERC20_MAINNET_DEPLOYMENT.address;
    const deadline = await time.latest() + 28800;
    const fee = 10000;

    quoter = QuoterV2__factory.connect('0x61fFE014bA17989E743c5F6cB21bF9697530B21e', recipient);
    const Erc20 =  IERC20__factory.connect(WETH9[1].address, recipient);
    const erc20Balance = await Erc20.balanceOf(recipient._address);

    console.log("Params", yieldPer100k, ethPrice, deadline, fee, erc20Balance);

    //Execute buyback
    const buybackAmount = ((totalFunding / 100000) * yieldPer100k) / ethPrice;
    // const amountOut = ethers.utils.parseUnits(buybackAmount.toFixed(ETH_DECIMALS), ETH_DECIMALS);
    const amountOut = 5000000000;
    console.log(buybackAmount)
    const uniswapPool = new ethers.Contract(UNISWAP_POOL_ADDRESS, UNISWAP_POOL_ABI, recipient);
    const liquidity = await uniswapPool.liquidity();
    console.log("Remaining liquidity: ", liquidity);
    const { amountIn }  = await quoter.callStatic.quoteExactOutputSingle({
        tokenIn, 
        tokenOut, 
        amount: amountOut, 
        fee, 
        sqrtPriceLimitX96: 0 
    });
    
    const {
        amountOut: newOut,
        sqrtPriceX96After,
    } = await quoter.callStatic.quoteExactInputSingle({
        tokenIn: WETH9[1].address,
        tokenOut: THEOERC20_MAINNET_DEPLOYMENT.address,
        amountIn,
        fee,
        sqrtPriceLimitX96: 0
    });

    if (amountIn.gt(erc20Balance)) {
        await hre.network.provider.send(SET_BALANCE_RPC_CALL, [
            recipient._address,
            BigNumber.from(100_010).mul(BigNumber.from(10).pow(18)).toHexString(),
        ]);

        await wait(200);

        const weth9 = new ethers.Contract(WETH9[1].address, WETH9_ABI.abi, recipient);
        await weth9.deposit({ value: BigNumber.from(100_000).mul(BigNumber.from(10).pow(18)) });
    }

    let params = {
        tokenIn: WETH9[1].address, 
        tokenOut: THEOERC20_MAINNET_DEPLOYMENT.address,
        fee: BigNumber.from(fee),
        recipient: recipient._address,
        deadline: BigNumber.from(deadline),
        amountIn,
        amountOutMinimum: newOut,
        sqrtPriceLimitX96: toHex(sqrtPriceX96After.toString()),
    };

    await waitFor(Erc20.approve(uniswapV3Router.address, amountIn));
    await waitFor(uniswapV3Router.exactInputSingle(params, { gasLimit: 1000000 }));

    //Execute Burn
    const THEO = TheopetraERC20Token__factory.connect(THEOERC20_MAINNET_DEPLOYMENT.address, recipient);
    const balance = await THEO.balanceOf(recipient._address);
    await waitFor(THEO.burn(balance))
}

async function getBondPrice(swapPrice: number, exponent: number, signer: any, amount: number) {
    const THEOerc = IERC20__factory.connect(THEOERC20_MAINNET_DEPLOYMENT.address, signer);
    const totalSupply = await THEOerc.totalSupply();
    return (BigNumber.from(swapPrice).mul(totalSupply).div(totalSupply.pow(exponent).div(totalSupply)).mul(totalSupply.add(amount).pow(exponent))); //Rewrite to avoid underflow
}

async function adjustLiquidityToPrice(ethPrice: number, lastEthPrice: number, signer: any) {
    // Simulates price changes in ETH by adjusting liquidity single sided above the current price
    const UNISWAP_NFPM_CONTRACT = new ethers.Contract(UNISWAP_NFPM, UNISWAP_FACTORY_ABI, signer);
    const weth9 = new ethers.Contract(WETH9[1].address, WETH9_ABI.abi, signer);

    // TODO: divide out ETH liquidity vs THEO liquidity
    let poolInfo = await getPoolInfo();
    const delta = (ethPrice / lastEthPrice) * 10**9; // Added decimals to preserve precision
    const amount = BigNumber.from(poolInfo.liquidity).mul(delta).div(10**9).sub(BigNumber.from(poolInfo.liquidity));
    const positionCount = await UNISWAP_NFPM_CONTRACT.balanceOf(signer._address); // Using the latest position, which should contain the entire pool
    const tokenId = await UNISWAP_NFPM_CONTRACT.tokenOfOwnerByIndex(signer._address, positionCount - 1);
    const deadline = await time.latest() + 28800;
    const calldatas = [];

    const positionInfo = await UNISWAP_NFPM_CONTRACT.positions(tokenId);

    const t0 = WETH9[1];
    const t1 = new Token(1, THEOERC20_MAINNET_DEPLOYMENT.address, 9, 't1', 'THEO');
    const liquidity = positionInfo.liquidity.toString();
    const tickLower = Number(positionInfo.tickLower.toString());
    const tickUpper = Number(positionInfo.tickUpper.toString());
    const fee = positionInfo.fee;

    const pool = new Pool(t0, t1, fee, poolInfo.sqrtPriceX96.toString(), poolInfo.liquidity.toString(), poolInfo.tick);
    const position = new Position({ pool, liquidity, tickLower, tickUpper });
    console.log("amount0in", position.amount0.multiply(10**18).toFixed(0));
    const amount0 = position.amount0.multiply(delta > 0 ? delta : delta + 20**9).divide(10**9).multiply(10**18).toFixed(0);
    const amount1 = position.amount1.multiply(10**9).toFixed(0);
    console.log("amount0: ", amount0, amount1);
    const newPosition = Position.fromAmounts({ 
        pool, 
        tickLower: nearestUsableTick(pool.tickCurrent, pool.tickSpacing) - pool.tickSpacing * 2,
        tickUpper: nearestUsableTick(pool.tickCurrent, pool.tickSpacing) + pool.tickSpacing * 2, 
        amount0, 
        amount1, 
        useFullPrecision: true});

    console.log(position);
    console.log("New position: ", newPosition);
    // const p0 = Position.fromAmounts({
    //     pool,
    //     tickLower:
    //         nearestUsableTick(pool.tickCurrent, pool.tickSpacing) -
    //         pool.tickSpacing * 2,
    //     tickUpper:
    //         nearestUsableTick(pool.tickCurrent, pool.tickSpacing) +
    //         pool.tickSpacing * 2,
    //     amount0,
    //     amount1,
    //     useFullPrecision: true,
    // })

    console.log("Price before: ", poolInfo.slot0.sqrtPriceX96.pow(2).mul(10**9).div(BigNumber.from(2).pow(192)));
    console.log(amount);
    console.log("Delta %: ", new Percent(delta > 0 ? delta - 10**9 : delta + 10**9, 1))

    // If positive, add liquidity, else remove liquidity
    if (amount.gt(0)) {

        const addLiquidityOptions: AddLiquidityOptions = {
            deadline: Math.floor(Date.now() / 1000) + 60 * 20,
            slippageTolerance: new Percent(1, 1),
            tokenId,
          }
        
        //Increase liquidity in position proportionally to the change in price
        const { calldata, value }  = NonfungiblePositionManager.addCallParameters(
                newPosition,
                addLiquidityOptions
            )
            
        await weth9.deposit({ value: amount });
        await weth9.approve(UNISWAP_NFPM_CONTRACT.address, amount);
        console.log("Multicall", calldata, value);
        // await signer.sendTransaction({
        //     data: calldata,
        //     to: UNISWAP_NFPM_CONTRACT.ADDRESS,
        //     value: value,
        //     from: signer._address
        // })
        await UNISWAP_NFPM_CONTRACT.multicall([{data: calldata, value: value}]);
    } else {
        
        //Decrease liquidity in position proportionally to the change in price
        const { calldata, value } = NonfungiblePositionManager.removeCallParameters(
                newPosition,
                {
                    tokenId,
                    liquidityPercentage: new Percent(delta + 10**9, 1),
                    slippageTolerance: new Percent(1, 1),
                    deadline,
                    collectOptions: {
                        expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(t0, '0'),
                        expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(t1, '0'),
                        recipient: signer._address
                    }
                }
            ) 
        console.log("Multicall");
        await UNISWAP_NFPM_CONTRACT.multicall([calldata, {value: value}]);
    }

    poolInfo = await getPoolInfo();
    console.log("Price after: ", BigNumber.from(poolInfo.sqrtPriceX96).pow(2).div(2^192).mul(10**9));
}

interface PoolInfo {
    token0: string
    token1: string
    fee: number
    tickSpacing: number
    sqrtPriceX96: BigNumberish
    liquidity: BigNumberish
    tick: number
    slot0: any
}

async function getPoolInfo(): Promise<PoolInfo> {
    const provider = ethers.provider;
    if (!provider) {
        throw new Error('No provider')
    }

    // const currentPoolAddress = computePoolAddress({
    //     factoryAddress: POOL_FACTORY_CONTRACT_ADDRESS,
    //     tokenA: CurrentConfig.tokens.token0,
    //     tokenB: CurrentConfig.tokens.token1,
    //     fee: CurrentConfig.tokens.poolFee,
    // })

    const currentPoolAddress = UNISWAP_POOL_ADDRESS;

    const poolContract = new ethers.Contract(
        currentPoolAddress,
        UNISWAP_POOL_ABI,
        provider
    )

    const [token0, token1, fee, tickSpacing, liquidity, slot0] =
        await Promise.all([
            poolContract.token0(),
            poolContract.token1(),
            poolContract.fee(),
            poolContract.tickSpacing(),
            poolContract.liquidity(),
            poolContract.slot0(),
        ])

    return {
        token0,
        token1,
        fee,
        tickSpacing,
        liquidity,
        sqrtPriceX96: slot0[0],
        tick: slot0[1],
        slot0: slot0
    }
}

export function toHex(bigintIsh: BigintIsh) {
    const bigInt = JSBI.BigInt(bigintIsh)
    let hex = bigInt.toString(16)
    if (hex.length % 2 !== 0) {
        hex = `0${hex}`
    }
    return `0x${hex}`
}

const range = (length: number) => Array.from({ length }, (value, index) => index);

function saveResults(rows: any[], runNumber: any) {
    const fsStream = fs.createWriteStream(`./run-${runNumber.toString()}-results-${new Date().getTime()}.csv`);
    writeToStream(fsStream, rows, { headers: true });
}

async function debug() {
    console.log("Debugging all functions...");
    await resetFork();
    const provider = new ethers.providers.JsonRpcProvider(JSON_RPC_URL);
    const govSigner = provider.getSigner(governorAddress);
    const [avgHodl, ethPrice, exponent, fundingRate, liquidityRatio, sentiment, startingTvl, variance, yieldPer100k, yieldReports] = [parameters.avgHodl[0], parameters.ethPrice[0], parameters.exponent[0], parameters.fundingRate[0], parameters.liquidityRatio[0], parameters.sentiment[0], parameters.startingTVL[0], parameters.variance[0], parameters.yieldPer100k[0], parameters.yieldReports[0]]
    console.log("Adjusting LP...");
    await adjustUniswapTVLToTarget(startingTvl, liquidityRatio);

    console.log("Executing buyback...");
    await executeBuybacks(yieldPer100k, ethPrice[0]);

    console.log("Adjusting liquidity to price...");
    await adjustLiquidityToPrice(ethPrice[1], ethPrice[0], govSigner);

    console.log("Generating bonds...");
    const bonds = generateBondPurchases(fundingRate, variance);
    console.log(bonds);

    console.log("Executing bonds...");
    const bondData = await executeBondTransactions(bonds, govSigner, 1, exponent.base);


    console.log("Generating swaps...");
    const swaps = await generateUniswapTransactions(ethPrice[1], variance, sentiment, govSigner);

    console.log("Executing swaps...");
    const swapData = await executeUniswapTransactions(swaps, avgHodl, govSigner);

    console.log("Results: ", swaps, swapData, bonds, bondData);
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

debug()
    .then(() => {
        console.log("Success!");
        process.exit(0)})
    .catch((e) => {
    console.log('the error is', e);
    process.exit(1)
    });

wait(5000)

// main()
//     .then(() => process.exit(0))
//     .catch((e) => {
//         console.log('the error is', e);
//         process.exit(1)
//     });


