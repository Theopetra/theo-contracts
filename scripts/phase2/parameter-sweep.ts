import  helpers from '@nomicfoundation/hardhat-network-helpers';
import { ethers } from 'hardhat';

import 'lodash.product';
import _ from 'lodash';


/*

    Yield reporter is called on an interval to report yields, using reportYield function, yields are then used by the treasury to inform deltaTreasuryYield
    tokenPerformanceUpdate is called on another interval to inform deltaTokenPrice within the TheopetraTreasury
    discountRateBond and discountRateYield are set for a market using setDiscountRateBond and setDiscountRateYield within TheopetraBondDepository
    tokenPerformanceUpdate is called 3 * 30 times while reportYield is called once for the same period
    a collection of transactions against the uniswap pool informs tokenPerformanceUpdate

    I. For each starting TVL in Uniswap Pool
        i. For each drB, drY, [yieldReports; size n]
            1. Set drB and drY
            2. for each EPOCH per yieldReport
                a. Generate a set of transactions to execute on uniswap pool
                b. Execute transactions against pool
                c. Execute tokenPerformanceUpdate
                d. Collect deltaTokenPrice, marketPrice, bondRateVariable, marketPrice, epoch number
                e. execute next reportYield
        ii. Reset Simulation State for next collection of parameters
 */

async function main() {
    const RPC_URL = process.env.ETH_NODE_URI_MAINNET;
    const BLOCK_NUMBER = 1111111111; // CHANGE ME
    const EPOCHS_PER_YIELD_REPORT = 3*30; // 3 per day, 30 days a month

    // if (!RPC_URL) throw Error("ETH_NODE_URI_MAINNET not set");

    const product = (_ as any).product; // stupid typescript doesn't recognize `product` on lodash >.>

    const parameters = {
        startingTVL: [1, 10, 100, 1000],
        drY: [0, 0.025, 0.5, 0.75, 1],
        drB: [0, 0.025, 0.5, 0.75, 1],
        yieldReports: [
            [1, 3, 5, 7],
            [2, 4, 6, 8],
        ]
    };

    const runResults = [];
    const runSet = product(parameters.startingTVL, parameters.drY, parameters.drB, parameters.yieldReports);

    for (const i in runSet) {
        const [startingTvl, drY, drB, yieldReports] = runSet[i];
        // set starting TVL

        for (const j in yieldReports) {
            // set drY and drB
            // call reportYield
            const yieldReport = yieldReports[j];

            for (let k = 0; k < EPOCHS_PER_YIELD_REPORT; k++) {
                // a. Get set of transactions to execute on uniswap pool
                // b. Execute transactions against pool
                // c. Execute tokenPerformanceUpdate
                // d. Collect deltaTokenPrice, marketPrice, bondRateVariable, marketPrice, epoch number

                runResults.push({
                    runNumber: i,
                    startingTvl,
                    drY,
                    drB,
                    yieldReport
                });
            }
        }

        // reset fork
        // await helpers.reset(RPC_URL, BLOCK_NUMBER);
    }

}

main()
    .then(() => {process.exit(0)})
    .catch((e) => {console.log(e); process.exit(1)})
