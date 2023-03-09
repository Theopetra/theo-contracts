import  helpers from '@nomicfoundation/hardhat-network-helpers';
import { ethers } from 'hardhat';

import 'lodash.product';
import _ from 'lodash';
import {Signer} from "ethers";
import { writeToStream } from "fast-csv";
import fs from 'fs';
import { IERC20Metadata__factory, TheopetraBondDepository__factory, TheopetraYieldReporter__factory, TheopetraTreasury__factory } from '../../typechain-types';

import UNISWAP_POOL_ABI from './UniswapV3PoolAbi.json';
import THEOERC20_MAINNET_DEPLOYMENT from '../../deployments/mainnet/TheopetraERC20Token.json';
import MAINNET_YIELD_REPORTER from '../../deployments/mainnet/TheopetraYieldReporter.json';
import MAINNET_BOND_DEPO from '../../deployments/mainnet/TheopetraBondDepository.json';
import MAINNET_TREASURY_DEPLOYMENT from '../../deployments/mainnet/TheopetraTreasury.json';

import {waitFor} from "../../test/utils";
import {sign} from "crypto";

const UNISWAP_POOL_ADDRESS = "0x1fc037ac35af9b940e28e97c2faf39526fbb4556";
const RPC_URL = process.env.ETH_NODE_URI_MAINNET;
const BLOCK_NUMBER = 1111111111; // CHANGE ME
const EPOCH_LENGTH = 8 * 60 * 60;
const EPOCHS_PER_YIELD_REPORT = 3*30; // 3 per day, 30 days a month
const BOND_MARKET_ID = 0; // TODO: Get actual market ID

const product = (_ as any).product; // stupid typescript doesn't recognize `product` on lodash >.>

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
    // if (!RPC_URL) throw Error("ETH_NODE_URI_MAINNET not set");

    const parameters = {
        startingTVL: [50000, 180000, 5000, 20000, 360000, 1000000],
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
    // TODO: fine tune getUniswapTransactions w.r.t. the context "Uniswap Transactions Per Epoch"
    const uniswapTxns = range(parameters.yieldReports[0].length)
        .map(() => range(EPOCHS_PER_YIELD_REPORT).map(() => getUniswapTransactions()));
    const bondPurchases = range(parameters.yieldReports[0].length)
        .map(() => range(EPOCHS_PER_YIELD_REPORT).map(() => getBondPurchases()));

    const runResults = [];
    const runSet = product(parameters.startingTVL, parameters.drY, parameters.drB, parameters.yieldReports);

    for (const i in runSet) {
        const [startingTvl, drY, drB, yieldReports] = runSet[i];
        // set starting TVL
        await adjustUniswapTVLToTarget(startingTvl, signer);

        for (let j = 0; j < yieldReports.length; j++) {
            const yieldReport = yieldReports[j];
            // report yield, set drY and drB
            await waitFor(TheopetraYieldReporter__factory.connect(MAINNET_YIELD_REPORTER.address, signer).reportYield(yieldReport));
            await waitFor(TheopetraBondDepository__factory.connect(MAINNET_BOND_DEPO.address, signer).setDiscountRateBond(BOND_MARKET_ID, drB));
            await waitFor(TheopetraBondDepository__factory.connect(MAINNET_BOND_DEPO.address, signer).setDiscountRateYield(BOND_MARKET_ID, drY));

            for (let k = 0; k < EPOCHS_PER_YIELD_REPORT; k++) {
                // a. Get set of transactions to execute on uniswap pool
                const uniswapTxnsThisEpoch = uniswapTxns[j][k];

                // b. Execute transactions against pool
                await executeUniswapTransactions(uniswapTxnsThisEpoch, signer);

                // c. Execute tokenPerformanceUpdate
                await waitFor(TheopetraTreasury__factory.connect(MAINNET_TREASURY_DEPLOYMENT.address, signer).tokenPerformanceUpdate());

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
                    deltaTokenPrice: await TheopetraTreasury__factory.connect(MAINNET_TREASURY_DEPLOYMENT.address, signer).deltaTokenPrice(),
                    bondRateVariable: await TheopetraBondDepository__factory.connect(MAINNET_BOND_DEPO.address, signer).bondRateVariable(BOND_MARKET_ID),
                    marketPrice: await TheopetraBondDepository__factory.connect(MAINNET_BOND_DEPO.address, signer).marketPrice(BOND_MARKET_ID),
                });

                // fast-forward chain-time to next epoch
                // await network.provider.send('evm_increaseTime', [EPOCH_LENGTH]);
            }
        }
        // reset fork
        // await helpers.reset(RPC_URL, BLOCK_NUMBER);
    }

    saveResults(runResults);
}

async function main() {
    await runAnalysis();
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

function getUniswapTransactions() {
    const countDist: Distribution       = { mean: 5,    stddev: 0 };
    const valueDist: Distribution       = { mean: 1000, stddev: 800 };
    const directionDist: Distribution   = { mean: 0,    stddev: 1 }; // Gaussian distribution centered around 0, greater than 0 is BUY, less than 0 is SELL
    const txnCount = getNormallyDistributedRandomNumber(countDist);
    const txnValues = range(txnCount).map(() => getNormallyDistributedRandomNumber(valueDist));
    const txnDirections = range(txnCount).map(() => getNormallyDistributedRandomNumber(directionDist) > 0 ? Direction.buy : Direction.sell);
    return range(txnCount).map(i => [txnValues[i], txnDirections[i]]);
}

function getBondPurchases() {
    const countDist: Distribution       = { mean: 5,    stddev: 0 };
    const valueDist: Distribution       = { mean: 1000, stddev: 800 };
    const txnCount = getNormallyDistributedRandomNumber(countDist);
    return range(txnCount).map(() => getNormallyDistributedRandomNumber(valueDist));
}

async function adjustUniswapTVLToTarget(target: number, signer: Signer) {
    const uniswapV3Pool = new ethers.Contract(UNISWAP_POOL_ADDRESS, UNISWAP_POOL_ABI, signer);
}

async function executeUniswapTransactions(transactions: Array<Array<(number|Direction)>>, signer: Signer) {
    const uniswapV3Pool = new ethers.Contract(UNISWAP_POOL_ADDRESS, UNISWAP_POOL_ABI, signer);
    const token0 = await uniswapV3Pool.token0();
    const token1 = await uniswapV3Pool.token1();

    const token0Decimals = await IERC20Metadata__factory.connect(token0, signer).decimals();
    const token1Decimals = await IERC20Metadata__factory.connect(token1, signer).decimals();


    const theoIsToken1 = THEOERC20_MAINNET_DEPLOYMENT.address === token1;

    for (const i in transactions) {
        const value: number = (transactions[i][0] as number);
        const direction: Direction = (transactions[i][1] as Direction);

        const recipient = await signer.getAddress();

        // if theo is token1, and we are buying, then we are swapping zero for one => zeroForOne = true
        // if theo is token1, and we are selling, then we are swapping one for zero => zeroForOne = false
        // if theo is token0, and we are selling, then we are swapping zero for one => zeroForOne = true
        // if theo is token0, and we are buying, then we are swapping one for zero => zeroForOne = false

        const zeroForOne = theoIsToken1 ? direction === Direction.buy : direction === Direction.sell;
        const amountSpecified = zeroForOne ? value * 10 ** token0Decimals : value * 10 ** token1Decimals;
        const txn = await uniswapV3Pool.swap(recipient, zeroForOne, amountSpecified, 0, []);

    }
}

async function executeBondTransactions(transactions: number[], signer: Signer) {
    for (let l = 0; l < transactions.length; l++) {
        // TODO: Figure out a good value for maxPrice
        const maxPrice = 1_000_000_000;
        await waitFor(TheopetraBondDepository__factory.connect(MAINNET_BOND_DEPO.address, signer).deposit(BOND_MARKET_ID, transactions[l], maxPrice, signer.address, signer.address, false));
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
