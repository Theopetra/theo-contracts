import { ethers, network } from 'hardhat';
import { hexZeroPad } from 'ethers/lib/utils';
import hre from 'hardhat';
import helpers from '@nomicfoundation/hardhat-network-helpers';
import type {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import 'lodash.product';
import _ from 'lodash';
import { writeToStream } from "fast-csv";
import fs from 'fs';
import {
    TheopetraBondDepository__factory,
    TheopetraYieldReporter__factory,
    TheopetraTreasury__factory,
    STheopetra__factory, IERC20__factory, ERC20__factory
} from '../../typechain-types';
import { time } from "@nomicfoundation/hardhat-network-helpers";

import UNISWAP_SWAP_ROUTER_ABI from './UniswapSwapRouter.json';
import UNISWAP_POOL_ABI from './UniswapV3PoolAbi.json';
import UNISWAP_FACTORY_ABI from './NonFungiblePositionManager.json';
import THEOERC20_MAINNET_DEPLOYMENT from '../../deployments/mainnet/TheopetraERC20Token.json';
import MAINNET_YIELD_REPORTER from '../../deployments/mainnet/TheopetraYieldReporter.json';
import MAINNET_BOND_DEPO from '../../deployments/mainnet/TheopetraBondDepository.json';
import MAINNET_BOND_CALC from '../../deployments/mainnet/NewBondingCalculatorMock.json';
import MAINNET_TREASURY_DEPLOYMENT from '../../deployments/mainnet/TheopetraTreasury.json';
import WETH9_ABI from './WETH9.json';
import { Interface } from '@ethersproject/abi'
import IMulticall from '@uniswap/v3-periphery/artifacts/contracts/interfaces/IMulticall.sol/IMulticall.json'
import {
    NonfungiblePositionManager,
    Position,
    Pool
} from '@uniswap/v3-sdk';
import {CurrencyAmount, Token, WETH9, Percent} from '@uniswap/sdk-core';

import {waitFor} from "../../test/utils";
import {BigNumberish} from "ethers";
import JSBI from "jsbi";

const UNISWAP_SWAP_ROUTER_ADDRESS = "";
const UNISWAP_POOL_ADDRESS = "0x1fc037ac35af9b940e28e97c2faf39526fbb4556";
const UNISWAP_FACTORY_ADDRESS = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';
const governorAddress = '0xb0D6fb365d04FbB7351b2C2796d895eBFDfC422A';

const RPC_URL = process.env.ETH_NODE_URI_MAINNET;
const BLOCK_NUMBER = 1111111111; // CHANGE ME
const EPOCH_LENGTH = 8 * 60 * 60;
const EPOCHS_PER_YIELD_REPORT = 3*30; // 3 per day, 30 days a month
const BOND_MARKET_ID = 0; // TODO: Get actual market ID

const THEO_DECIMALS = 9;
const ETH_DECIMALS = 18;

const product = (_ as any).product; // stupid typescript doesn't recognize `product` on lodash >.>
const BigNumber = ethers.BigNumber;
const FixedNumber = ethers.FixedNumber;


/*
    Yield reporter is called on an interval to report yields, using reportYield function, yields are then used by the treasury to inform deltaTreasuryYield
    tokenPerformanceUpdate is called on another interval to inform deltaTokenPrice within the TheopetraTreasury
    discountRateBond and discountRateYield are set for a market using setDiscountRateBond and setDiscountRateYield within TheopetraBondDepository
    tokenPerformanceUpdate is called 3 * 30 times while reportYield is called once for the same period
    a collection of transactions against the uniswap pool informs tokenPerformanceUpdate

    I. For each starting TVL in Uniswap Pool
        i. For each drB, drY, [yieldReports; size n]
            1. Set drB and drY
            2. execute next reportYield
            3. for each EPOCH per yieldReport
                a. Generate a set of transactions to execute on uniswap pool
                b. Execute transactions against pool
                c. Execute tokenPerformanceUpdate
                d. Collect deltaTokenPrice, marketPrice, bondRateVariable, marketPrice, epoch number
                e. execute bond transaction
        ii. Reset Simulation State for next collection of parameters
 */

async function runAnalysis() {
    const [signer] = await ethers.getSigners();
    if (!RPC_URL) throw Error("ETH_NODE_URI_MAINNET not set");
    const TheopetraYieldReporter = TheopetraYieldReporter__factory.connect(MAINNET_YIELD_REPORTER.address, signer);
    const TheopetraBondDepository = TheopetraBondDepository__factory.connect(MAINNET_BOND_DEPO.address, signer);
    const STheopetra = STheopetra__factory.connect(THEOERC20_MAINNET_DEPLOYMENT.address, signer);
    const TheopetraTreasury = TheopetraTreasury__factory.connect(MAINNET_TREASURY_DEPLOYMENT.address, signer);

    const parameters = {
        startingTVL: [50000, 180000, 5000, 20000, 360000, 1000000],
        liquidityRatio: [
            // 0.0001805883567
            [
                1805883567, // numerator
                10000000000000 // denominator
            ]
        ],
        drY: [0, 0.01, 0.025, 0.0375, 0.05, 1],
        drB: [0, 0.01, 0.025, 0.0375, 0.05, 1],
        yieldReports: [
            [2400, 2400, 2400, 2400],
            [2400, 2400, 2400, 2400, 2400, 2400, 2400, 2400],
            [2400, 4800, 8200, 10600],
            [2400, 4800, 9600, 19200]
        ]
    };

    // four dimensional array
    // 1st dimension: yield reports
    // 2nd dimension: epochs per yield report
    // 3rd dimension: Transactions per epoch
    // TODO: fine tune generateUniswapTransactions w.r.t. the context "Uniswap Transactions Per Epoch"
    const uniswapTxns = range(parameters.yieldReports[0].length)
        .map(() => range(EPOCHS_PER_YIELD_REPORT).map(() => generateUniswapTransactions()));

    // TODO: fine tune generateBondPurchases
    const bondPurchases = range(parameters.yieldReports[0].length)
        .map(() => range(EPOCHS_PER_YIELD_REPORT).map(() => generateBondPurchases()));

    const runResults = [];
    const runSet = product(parameters.startingTVL, parameters.liquidityRatio, parameters.drY, parameters.drB, parameters.yieldReports);

    for (const i in runSet) {
        const [startingTvl, liquidityRatio, drY, drB, yieldReports] = runSet[i];
        // set starting TVL
        await adjustUniswapTVLToTarget(startingTvl, liquidityRatio);

        for (let j = 0; j < yieldReports.length; j++) {
            const yieldReport = yieldReports[j];
            // report yield, set drY and drB
            await waitFor(TheopetraYieldReporter.reportYield(yieldReport));
            await waitFor(TheopetraBondDepository.setDiscountRateBond(BOND_MARKET_ID, drB));
            await waitFor(TheopetraBondDepository.setDiscountRateYield(BOND_MARKET_ID, drY));

            for (let k = 0; k < EPOCHS_PER_YIELD_REPORT; k++) {
                const logRebaseFilter = STheopetra.filters["LogRebase(uint256,uint256,uint256)"]();
                const rebaseEvents = await STheopetra.queryFilter(logRebaseFilter);
                const currentEpoch = rebaseEvents.map((i: any) => i.epoch).reduce((p,c) => (c > p ? c : p));

                // a. Get set of transactions to execute on uniswap pool
                const uniswapTxnsThisEpoch = uniswapTxns[j][k];

                // b. Execute transactions against pool
                await executeUniswapTransactions(uniswapTxnsThisEpoch, signer);

                // c. Execute tokenPerformanceUpdate
                await waitFor(TheopetraTreasury.tokenPerformanceUpdate());

                // d. execute bond transactions
                const bondPurchasesThisEpoch = bondPurchases[j][k];
                await executeBondTransactions(bondPurchasesThisEpoch, signer);

                // e. Collect deltaTokenPrice, marketPrice, bondRateVariable, marketPrice, epoch number
                runResults.push({
                    runNumber: i,
                    startingTvl,
                    drY,
                    drB,
                    yieldReport,
                    yieldReportIdx: j,
                    epochIdx: k,
                    epochNumber: currentEpoch,
                    deltaTokenPrice: await TheopetraTreasury.deltaTokenPrice(),
                    bondRateVariable: await TheopetraBondDepository.bondRateVariable(BOND_MARKET_ID),
                    marketPrice: await TheopetraBondDepository.marketPrice(BOND_MARKET_ID),
                });

                // fast-forward chain-time to next epoch
                await network.provider.send('evm_increaseTime', [EPOCH_LENGTH]);
            }
        }
        // reset fork
        await helpers.reset(RPC_URL, BLOCK_NUMBER);
    }

    saveResults(runResults);
}

async function main() {
    try {
        await runAnalysis();
    } catch (e) {
        console.log(e);
    }
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

function generateUniswapTransactions() {
    const countDist: Distribution       = { mean: 5,    stddev: 0 };
    const valueDist: Distribution       = { mean: 1000, stddev: 800 };
    const directionDist: Distribution   = { mean: 0,    stddev: 1 }; // Gaussian distribution centered around 0, greater than 0 is BUY, less than 0 is SELL
    const txnCount = getNormallyDistributedRandomNumber(countDist);
    const txnValues = range(txnCount).map(() => getNormallyDistributedRandomNumber(valueDist));
    const txnDirections = range(txnCount).map(() => getNormallyDistributedRandomNumber(directionDist) > 0 ? Direction.buy : Direction.sell);
    return range(txnCount).map(i => [txnValues[i], txnDirections[i]]);
}

function generateBondPurchases() {
    const countDist: Distribution       = { mean: 5,    stddev: 0 };
    const valueDist: Distribution       = { mean: 1000, stddev: 800 };
    const txnCount = getNormallyDistributedRandomNumber(countDist);
    return range(txnCount).map(() => getNormallyDistributedRandomNumber(valueDist));
}

async function adjustUniswapTVLToTarget(target: number, [ratioNumerator, ratioDenominator]: number[]) {
    //Impersonate Governor wallet and wrap ETH
    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [governorAddress],
    });

    const provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:8545/');

    const ethPrice = BigNumber.from(1759); // TODO: query live price
    const govSigner = provider.getSigner(governorAddress);
    const uniswapV3Pool = new ethers.Contract(UNISWAP_POOL_ADDRESS, UNISWAP_POOL_ABI, govSigner);
    const uniswapV3Factory = new ethers.Contract(UNISWAP_FACTORY_ADDRESS, UNISWAP_FACTORY_ABI, govSigner);
    const token0Address = await uniswapV3Pool.token0();
    const token1Address = await uniswapV3Pool.token1();

    const token0 = ERC20__factory.connect(token0Address, govSigner);
    const token1 = ERC20__factory.connect(token1Address, govSigner);
    const weth = (await token0.symbol()) === 'WETH' ? token0 : token1;
    const theo = (await token0.symbol()) === 'WETH' ? token1 : token0;
    // const actualETHValueLocked = wethBalance.div(BigNumber.from(10).pow(ETH_DECIMALS)).mul(ethPrice);
    // half of liquidity is supplied with WETH
    const wethTarget = BigNumber.from(target/2).div(ethPrice).mul(BigNumber.from(10).pow(ETH_DECIMALS));
    const denom = BigNumber.from(1);

    const theoTargetNumerator = wethTarget.mul(ratioDenominator);
    const theoTargetDenominator = denom.mul(ratioNumerator);

    const theoTarget = theoTargetNumerator.div(theoTargetDenominator);
    //Impersonate treasury and mint THEO to Governor address
    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [MAINNET_TREASURY_DEPLOYMENT.address],
    });

    await hre.network.provider.send("hardhat_setBalance", [
        governorAddress,
        wethTarget.toHexString(),
    ]);

    await hre.network.provider.send("hardhat_setBalance", [
        governorAddress,
        "0x152D02C7E14AF6800000",
    ]);

    await hre.network.provider.send("hardhat_setBalance", [
        MAINNET_TREASURY_DEPLOYMENT.address,
        "0x8ac7230489e80000",
    ]);

    const treasurySigner = provider.getSigner(MAINNET_TREASURY_DEPLOYMENT.address);
    const theoERC20 = new ethers.Contract(THEOERC20_MAINNET_DEPLOYMENT.address, THEOERC20_MAINNET_DEPLOYMENT.abi, treasurySigner);
    await theoERC20.mint(governorAddress, BigNumber.from(theoTarget));
    //mintTheoToSigners(signer, treasurySigner);


    const weth9 = new ethers.Contract(WETH9[1].address, WETH9_ABI.abi, govSigner);

    await weth9.deposit({ value: wethTarget });

    /*  
        Token IDs are reported in Transfer events from the Uniswap factory address, 
        but don't indicate the pool they belong to.

        Mint events in the pool contract are delegated through the factory contract, 
        but the sender can be found through the transaction logs for the event.

        By filtering for the Mint events, accessing the tx hash property and querying the transaction, 
        we can find the sender address and use it to filter transfer events in the factory contract to list all LP position token IDs for the given pool.
    */
   
    const mintFilter = {
        address: UNISWAP_POOL_ADDRESS,
        topics: [
            '0x7a53080ba414158be7ec69b987b5fb7d07dee101fe85488f0853ae16239d0bde',
        ],
        fromBlock: 15460378
    }

    const deadline = await time.latest() + 28800;

    const logs = await provider.getLogs(mintFilter);
    const txs = await Promise.all(logs.map((log) => (provider.getTransaction(log.transactionHash))));
    const fromAddrs = await Promise.all(txs.map(async (transaction) => transaction.from));
    const eventsList = await Promise.all(fromAddrs.map(fromAddr => {
        const transferFilter = {
            address: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
            topics: [
                '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
                null,
                hexZeroPad(fromAddr, 32)],
            fromBlock: 15460379
        };
        return provider.getLogs(transferFilter);
    }));

    // eventsList.forEach(item => console.log(item.toString()));
    const tokenIds = await Promise.all(eventsList.map(async (event) => Promise.all(event.map(async (event) => event.topics[3]))));
    await removeAllLiquidity(tokenIds, fromAddrs, govSigner, deadline);
    console.log('Liquidity removed from LP');

    //Once pool is empty, call mint to create new position across the full range with the target liquidity
    //If this fails it's because of tick spacing, adjust fee, or adjust tick to amount divisible by 200
    const addArgs = [
        "0x88316456",
        THEOERC20_MAINNET_DEPLOYMENT.address,
        WETH9[1].address,
        "10000",
        BigNumber.from(wethTarget),
        BigNumber.from(theoTarget),
        "887272",
        "-887272",
        "0",
        "0",
        governorAddress,
        deadline
    ]
    await weth9.approve(uniswapV3Pool.address, wethTarget);
    await theoERC20.approve(uniswapV3Pool.address, theoTarget);
    await uniswapV3Factory.multicall(addArgs);
}

async function removeAllLiquidity(tokenIds: string[][], fromAddrs: string[], signer: any, deadline: number) {
    const UNISWAP_FACTORY_CONTRACT = new ethers.Contract(UNISWAP_FACTORY_ADDRESS, UNISWAP_FACTORY_ABI, signer);
    const UNISWAP_POOL_CONTRACT = new ethers.Contract(UNISWAP_POOL_ADDRESS, UNISWAP_POOL_ABI, signer);
    const provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:8545/');

    for (let i = 0; i < tokenIds.length; i++) {
        for (let j = 0; j < tokenIds[i].length; j++) {
            const id = tokenIds[i][j];
            const positionInfo = await UNISWAP_FACTORY_CONTRACT.positions(id);
            const poolInfo = await getPoolInfo();

            if (positionInfo.liquidity > 0 && (positionInfo.token0 == THEOERC20_MAINNET_DEPLOYMENT.address || positionInfo.token1 == THEOERC20_MAINNET_DEPLOYMENT.address)) {
                await hre.network.provider.request({
                    method: "hardhat_impersonateAccount",
                    params: [fromAddrs[i]],
                });

                const impersonatedSigner = provider.getSigner(fromAddrs[i]);
                const UNISWAP_FACTORY_IMPERSONATOR = new ethers.Contract(UNISWAP_FACTORY_ADDRESS, UNISWAP_FACTORY_ABI, impersonatedSigner);

                const calldata = [];
                // const fee = 10000;
                const t0 = new Token(1, THEOERC20_MAINNET_DEPLOYMENT.address, 9, 't1', 'THEO');
                const t1 = WETH9[1];

                const liquidity = positionInfo.liquidity.toString();
                const tickLower = Number(positionInfo.tickLower.toString());
                const tickUpper = Number(positionInfo.tickUpper.toString());
                const fee = positionInfo.fee;

                const pool = new Pool(t0, t1, fee, poolInfo.sqrtPriceX96.toString(), poolInfo.liquidity.toString(), poolInfo.tick);
                const position = new Position({ pool, liquidity, tickLower, tickUpper });

                const p0 = NonfungiblePositionManager.removeCallParameters(
                    position,
                    {
                        tokenId: id,
                        liquidityPercentage: new Percent(1, 1),
                        slippageTolerance: new Percent(1, 1),
                        deadline,
                        collectOptions: {
                            expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(t0, '170141183460469231731687303715884105727'),
                            expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(t1, '170141183460469231731687303715884105727'),
                            recipient: fromAddrs[i]
                        }
                    }
                );
                console.log(fromAddrs[i]);
                console.log(positionInfo);
                console.log(impersonatedSigner);
                console.log([p0.calldata]);
                console.log(await UNISWAP_POOL_CONTRACT.maxLiquidityPerTick());
                await UNISWAP_FACTORY_IMPERSONATOR.multicall([p0.calldata]);
                console.log(await UNISWAP_POOL_CONTRACT.maxLiquidityPerTick());
            }
        }
    }
}

// Function to encode a single value based on its type
function encodeValue(element: any) {
    return ethers.utils.defaultAbiCoder.encode([element.type], [element.value]);
}

async function executeUniswapTransactions(transactions: Array<Array<(number|Direction)>>, signer: SignerWithAddress) {
    const uniswapV3Router = new ethers.Contract(UNISWAP_POOL_ADDRESS, UNISWAP_SWAP_ROUTER_ABI, signer);
    const recipient = await signer.getAddress();

    for (const i in transactions) {
        const direction: Direction = (transactions[i][1] as Direction);
        const tokenIn = direction === Direction.buy ? WETH9[1].address : THEOERC20_MAINNET_DEPLOYMENT.address;
        const tokenOut = direction === Direction.buy ? THEOERC20_MAINNET_DEPLOYMENT.address : WETH9[1].address;
        const tokenInDecimals = direction === Direction.buy ? ETH_DECIMALS : THEO_DECIMALS;
        const tokenOutDecimals = direction === Direction.buy ? THEO_DECIMALS : ETH_DECIMALS;
        const sqrtPriceLimitX96 = 0;
        const fee = 10000; // TODO: verify fee

        const Erc20 = Direction.buy ? IERC20__factory.connect(THEOERC20_MAINNET_DEPLOYMENT.address, signer) : IERC20__factory.connect(WETH9[1].address, signer);
        const deadline = await time.latest() + 28800;

        if (direction == Direction.buy) {
            const amountOut = BigNumber.from((transactions[i][0])).mul(BigNumber.from(10).pow(tokenOutDecimals));
            const amountInMaximum = BigNumber.from(10).mul(BigNumber.from(10).pow(10));

            await waitFor(Erc20.approve(UNISWAP_SWAP_ROUTER_ADDRESS, amountInMaximum));

            const params = {
                tokenIn,
                tokenOut,
                fee,
                recipient,
                deadline,
                amountOut,
                amountInMaximum,
                sqrtPriceLimitX96
            };

            await waitFor(uniswapV3Router.exactOutputSingle(params));
        } else {
            // TODO: Is something better than 0 need for testing?
            const amountOutMin = 0;
            const amountIn = BigNumber.from((transactions[i][0])).mul(BigNumber.from(10).pow(tokenInDecimals));

            await waitFor(Erc20.approve(UNISWAP_SWAP_ROUTER_ADDRESS, amountIn));

            const params = {
                tokenIn,
                tokenOut,
                fee,
                recipient,
                deadline,
                amountIn,
                amountOutMin,
                sqrtPriceLimitX96
            };

            await waitFor(uniswapV3Router.exactInputSingle(params));
        }
    }
}

async function executeBondTransactions(transactions: number[], signer: SignerWithAddress) {
    const TheopetraBondDepository = TheopetraBondDepository__factory.connect(MAINNET_BOND_DEPO.address, signer);
    for (let l = 0; l < transactions.length; l++) {
        // TODO: Figure out a sensible value for maxPrice
        const maxPrice = BigNumber.from(1).mul(BigNumber.from(10).pow(18));
        const theoToBond = BigNumber.from(transactions[l]);
        await waitFor(TheopetraBondDepository.deposit(BOND_MARKET_ID, theoToBond, maxPrice, signer.address, signer.address, false));
    }
}

interface PoolInfo {
    token0: string
    token1: string
    fee: number
    tickSpacing: number
    sqrtPriceX96: BigNumberish
    liquidity: BigNumberish
    tick: number
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
    }
}

const range = (length: number) => Array.from({ length }, (value, index) => index);

function saveResults(rows: any[]) {
    const fsStream = fs.createWriteStream(`./run-results-${new Date().getTime()}.csv`);
    writeToStream(fsStream, rows);
}

main()
    .then(() => process.exit(0))
    .catch((e) => {
        console.log(e);
        process.exit(1)
    });
