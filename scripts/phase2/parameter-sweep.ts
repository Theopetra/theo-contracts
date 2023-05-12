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
    QuoterV2__factory
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
    nearestUsableTick, TickMath, FeeAmount,

} from '@uniswap/v3-sdk';
import {BigintIsh, CurrencyAmount, Fraction, Percent, sqrt, Token, TradeType, WETH9,} from '@uniswap/sdk-core';

import {waitFor} from "../../test/utils";
import {BigNumberish} from "ethers";
import JSBI from "jsbi";

const SWAP_ROUTER_ADDRESS = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";
const NON_FUNGIBLE_POSITION_MANAGER_ADDRESS = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';
const UNISWAP_POOL_ADDRESS = "0x1fc037ac35af9b940e28e97c2faf39526fbb4556";
const UNISWAP_NFPM = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';
const UNISWAP_FACTORY_ADDRESS = '0x1F98431c8aD98523631AE4a59f267346ea31F984';
const governorAddress = '0xb0D6fb365d04FbB7351b2C2796d895eBFDfC422A';
const policyAddress = '0x3a051657830b6baadd4523d35061a84ec7ce636a';
const managerAddress = '0xf4abccd90596c8d11a15986240dcad09eb9d6049';

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
const Contract = ethers.Contract;

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

const USING_TENDERLY = false;
const JSON_RPC_URL = USING_TENDERLY ? 'https://rpc.tenderly.co/fork/9b04bcf4-0150-481b-8be9-a5a48779964c' : 'http://127.0.0.1:8545/';
const SET_BALANCE_RPC_CALL = USING_TENDERLY ? "tenderly_setBalance" : "hardhat_setBalance";

let quoter: any;

async function runAnalysis() {
    const QuoterV2 = await ethers.getContractFactory('QuoterV2');
    quoter = await QuoterV2.deploy(UNISWAP_FACTORY_ADDRESS, WETH9[1].address);
    await quoter.deployed();


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
        "0x8ac7230489e80000",
    ]);


    const govSigner = provider.getSigner(governorAddress);
    const managerSigner = provider.getSigner(managerAddress);
    const policySigner = provider.getSigner(policyAddress);

    if (!RPC_URL) throw Error("ETH_NODE_URI_MAINNET not set");
    const TheopetraYieldReporter = TheopetraYieldReporter__factory.connect(MAINNET_YIELD_REPORTER.address, managerSigner);
    const TheopetraBondDepository = TheopetraBondDepository__factory.connect(MAINNET_BOND_DEPO.address, policySigner);

    const STheopetra = STheopetra__factory.connect(THEOERC20_MAINNET_DEPLOYMENT.address, govSigner);
    const TheopetraTreasury = TheopetraTreasury__factory.connect(MAINNET_TREASURY_DEPLOYMENT.address, govSigner);

    const parameters = {
        startingTVL: [50000, 180000, 5000, 20000, 360000, 1000000],
        liquidityRatio: [
            // 0.0001805883567
            [
                10000000000000, // numerator
                1805883567 // denominator
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

    /*
        Initialize bond market.
        Quote token is in USDC. Initial discount set at 5%, max discount at 20%. 
        Total capacity is $6,000,000 in ETH over 1 year, at a deposit and tuning interval of 8 hours.
        The implied funding rate is $5,479.45 or roughly 3 ETH per 8 hour period. Volume lower than this will cause the discount rate to drop, above will cause it to rise.
    */

    await TheopetraBondDepository.create(
        "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", 
        [BigNumber.from("3334000000000000000000"), BigNumber.from(Math.floor(parameters.liquidityRatio[0][0] / parameters.liquidityRatio[0][1])), BigNumber.from(10000)],
        [true, true],
        [1209600, 1714092686],
        [500000, 20000000000, 0, 0],
        [28800, 28800]
    );

    console.log("Market created, active ids:", await TheopetraBondDepository.getMarkets());

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
        // await adjustUniswapTVLToTarget(startingTvl, liquidityRatio);
        console.log('UniswapTVL adjusted to target.')
        for (let j = 0; j < yieldReports.length; j++) {
            const yieldReport = yieldReports[j];
            // report yield, set drY and drB
            await waitFor(TheopetraYieldReporter.reportYield(yieldReport)); // onlyManager
            await waitFor(TheopetraBondDepository.setDiscountRateBond(BOND_MARKET_ID, drB)); // onlyPolicy
            await waitFor(TheopetraBondDepository.setDiscountRateYield(BOND_MARKET_ID, drY)); // onlyPolicy
            console.log('Protocol parameters set.')

            for (let k = 0; k < EPOCHS_PER_YIELD_REPORT; k++) {
                const logRebaseFilter = STheopetra.filters["LogRebase(uint256,uint256,uint256)"]();
                const rebaseEvents = await STheopetra.queryFilter(logRebaseFilter);
                const currentEpoch = rebaseEvents.map((i: any) => i.epoch).reduce((p,c) => (c > p ? c : p), 0);

                // a. Get set of transactions to execute on uniswap pool
                const uniswapTxnsThisEpoch = uniswapTxns[j][k];

                // b. Execute transactions against pool
                console.log('Executing trades against pool.');
                await executeUniswapTransactions(uniswapTxnsThisEpoch, govSigner);
                console.log('Executed trades against pool.');

                // c. Execute tokenPerformanceUpdate
                await waitFor(TheopetraTreasury.tokenPerformanceUpdate());
                console.log("Updated Token Performance");

                // d. execute bond transactions
                const bondPurchasesThisEpoch = bondPurchases[j][k];
                console.log('Executing bond transactions.')
                await executeBondTransactions(bondPurchasesThisEpoch, policySigner);
                console.log("Executed Bond Transactions");

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
    const txnValues = range(txnCount).map(() => Math.abs(getNormallyDistributedRandomNumber(valueDist)));
    const txnDirections = range(txnCount).map(() => getNormallyDistributedRandomNumber(directionDist) > 0 ? Direction.buy : Direction.sell);
    return range(txnCount).map(i => [txnValues[i], txnDirections[i]]);
}

function generateBondPurchases() {
    const countDist: Distribution       = { mean: 5,    stddev: 0 };
    const valueDist: Distribution       = { mean: 1000, stddev: 800 };
    const txnCount = getNormallyDistributedRandomNumber(countDist);
    return range(txnCount).map(() => Math.abs(getNormallyDistributedRandomNumber(valueDist)));
}

async function adjustUniswapTVLToTarget(target: number, [ratioNumerator, ratioDenominator]: number[]) {
    console.log("Adjusting TVL to Target");
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
    console.log(`token0: ${token0symbol} | token1 ${token1symbol}`);

    // const actualETHValueLocked = wethBalance.div(BigNumber.from(10).pow(ETH_DECIMALS)).mul(ethPrice);
    // half of liquidity is supplied with WETH
    const wethTarget = BigNumber.from(target/2).div(ethPrice).mul(BigNumber.from(10).pow(ETH_DECIMALS));
    const denom = BigNumber.from(1);

    const theoTargetNumerator = wethTarget.mul(ratioDenominator);
    const theoTargetDenominator = denom.mul(ratioNumerator);

    const theoTarget = theoTargetNumerator.div(theoTargetDenominator);
    //Impersonate treasury and mint THEO to Governor address
    if (!USING_TENDERLY) await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [MAINNET_TREASURY_DEPLOYMENT.address],
    });

    await hre.network.provider.send(SET_BALANCE_RPC_CALL, [
        governorAddress,
        wethTarget.toHexString(),
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

    console.log("test1");
    const weth9 = new ethers.Contract(WETH9[1].address, WETH9_ABI.abi, govSigner);

    await weth9.deposit({ value: wethTarget.add(wethTarget.div(10)) });

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
    console.log("test2");
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

    const uniswapPool = new ethers.Contract(UNISWAP_POOL_ADDRESS, UNISWAP_POOL_ABI, govSigner);
    const liquidity = await uniswapPool.liquidity();
    console.log('liquidity after removing:', liquidity.toString());

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
    console.log('mint liquidity done')
}

async function removeAllLiquidity(tokenIds: string[][], fromAddrs: string[], signer: any, deadline: number) {
    console.log("Removing all liquidity from LP")
    const UNISWAP_NFPM_CONTRACT = new ethers.Contract(UNISWAP_NFPM, UNISWAP_FACTORY_ABI, signer);
    const UNISWAP_POOL_CONTRACT = new ethers.Contract(UNISWAP_POOL_ADDRESS, UNISWAP_POOL_ABI, signer);
    const provider = new ethers.providers.JsonRpcProvider(JSON_RPC_URL);

    for (let i = 0; i < tokenIds.length; i++) {
        for (let j = 0; j < tokenIds[i].length; j++) {
            const id = tokenIds[i][j];
            const positionInfo = await UNISWAP_NFPM_CONTRACT.positions(id);
            const poolInfo = await getPoolInfo();

            if (positionInfo.liquidity > 0 && (positionInfo.token0 == THEOERC20_MAINNET_DEPLOYMENT.address || positionInfo.token1 == THEOERC20_MAINNET_DEPLOYMENT.address)) {
                if (!USING_TENDERLY) await hre.network.provider.request({
                    method: "hardhat_impersonateAccount",
                    params: [fromAddrs[i]],
                });

                const impersonatedSigner = provider.getSigner(fromAddrs[i]);

                const calldata = [];
                // const fee = 10000;
                const t0 = WETH9[1];
                const t1 = new Token(1, THEOERC20_MAINNET_DEPLOYMENT.address, 9, 't1', 'THEO');

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
                
                await UNISWAP_NFPM_CONTRACT
                    .connect(impersonatedSigner)
                    .multicall([p0.calldata]);
            }
        }
    }
}

// Function to encode a single value based on its type
function encodeValue(element: any) {
    return ethers.utils.defaultAbiCoder.encode([element.type], [element.value]);
}

async function executeUniswapTransactions(transactions: Array<Array<(number|Direction)>>, signer: any) {

    const recipient = await signer.getAddress();
    const provider = new ethers.providers.JsonRpcProvider(JSON_RPC_URL);
    const signatore = await provider.getSigner(recipient);

    console.log("executing uniswap txns")

    const uniswapPool = new ethers.Contract(UNISWAP_POOL_ADDRESS, UNISWAP_POOL_ABI, signatore);
    const uniswapV3Router = new ethers.Contract(SWAP_ROUTER_ADDRESS, UNISWAP_SWAP_ROUTER_ABI, signatore);

    console.log("test2")

    for (const i in transactions) {
        const direction: Direction = (transactions[i][1] as Direction);
        const value: number = (transactions[i][0] as number);
        const signerAddress = await signer.getAddress();

        const tokenIn = direction === Direction.buy ? WETH9[1].address : THEOERC20_MAINNET_DEPLOYMENT.address;
        const tokenOut = direction === Direction.buy ? THEOERC20_MAINNET_DEPLOYMENT.address : WETH9[1].address;
        const tokenInDecimals = direction === Direction.buy ? ETH_DECIMALS : THEO_DECIMALS;
        const tokenOutDecimals = direction === Direction.buy ? THEO_DECIMALS : ETH_DECIMALS;
        const Erc20 =  direction === Direction.buy ?  IERC20__factory.connect(WETH9[1].address, signer) : IERC20__factory.connect(THEOERC20_MAINNET_DEPLOYMENT.address, signer);

        const fee = 10000;
        const deadline = await time.latest() + 28800;
        const erc20Balance = await Erc20.balanceOf(signerAddress);

        if (direction === Direction.buy) {
            const amountOut = ethers.utils.parseUnits(value.toFixed(tokenOutDecimals), tokenOutDecimals); //.mul(BigNumber.from(10).pow(tokenOutDecimals));
            console.log("amountOut", amountOut.toString(), value)

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
                console.log("insufficient ETH balance to buy THEO");
                console.log((await Erc20.balanceOf(signerAddress)).toString());
                console.log("amountIn", amountIn.toString());
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
            const amountIn = BigNumber.from(Math.floor(100)).mul(BigNumber.from(10).pow(tokenInDecimals));
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

            await waitFor(Erc20.approve(uniswapV3Router.address, amountIn));
            await waitFor(uniswapV3Router.exactInputSingle(params, { gasLimit: 1000000 }));
        }
    }
}

async function executeBondTransactions(transactions: number[], signer: any) {
    const ERC20 = IERC20__factory.connect(THEOERC20_MAINNET_DEPLOYMENT.address, signer);

    const TheopetraBondDepository = TheopetraBondDepository__factory.connect(MAINNET_BOND_DEPO.address, signer);
    const signerAddress = await signer.getAddress();

    console.log(TheopetraBondDepository.address);
    for (let l = 0; l < transactions.length; l++) {
        // TODO: Figure out a sensible value for maxPrice
        const maxPrice = BigNumber.from(1).mul(BigNumber.from(10).pow(18));
        const theoToBond = ethers.utils.parseUnits(transactions[l].toFixed(9), 9);
        await waitFor(ERC20.approve(TheopetraBondDepository.address, theoToBond));
        await waitFor(TheopetraBondDepository.deposit(BOND_MARKET_ID, theoToBond, maxPrice, signerAddress, signerAddress, false));
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

export function toHex(bigintIsh: BigintIsh) {
    const bigInt = JSBI.BigInt(bigintIsh)
    let hex = bigInt.toString(16)
    if (hex.length % 2 !== 0) {
        hex = `0${hex}`
    }
    return `0x${hex}`
}

const range = (length: number) => Array.from({ length }, (value, index) => index);

function saveResults(rows: any[]) {
    const fsStream = fs.createWriteStream(`./run-results-${new Date().getTime()}.csv`);
    writeToStream(fsStream, rows);
}

async function getPositionsForPool(poolAddress: string, provider: any) {
    // Instantiate NonFungiblePositionManager contract
    const nonFungiblePositionManager = new Contract(NON_FUNGIBLE_POSITION_MANAGER_ADDRESS, NonfungiblePositionManager.INTERFACE, provider);

    // Get the total number of positions
    const totalSupply = await nonFungiblePositionManager.totalSupply();

    const positions = [];

    // Iterate through all token IDs
    for (let tokenId = 1; tokenId <= totalSupply; tokenId++) {
        // Get position details
        const position = await nonFungiblePositionManager.positions(tokenId);

        // Check if the position is for the desired pool
        if (position.pool === poolAddress && !position.liquidity.isZero()) {
            positions.push(position);
        }
    }

    return positions;
}

async function checkLiquidity(poolAddress: string, desiredOutputAmount: BigNumberish, outputTokenIndex: number, tickLower: number, tickUpper:number, provider:any) {
    const positions = await getPositionsForPool(poolAddress, provider);
    let totalLiquidity = ethers.BigNumber.from(0);

    // Iterate through positions and sum the liquidity within the given tick range
    for (const position of positions) {
        if (position.tickLower < tickUpper && position.tickUpper > tickLower) {
            totalLiquidity = totalLiquidity.add(position.liquidity);
        }
    }

    // TODO: Calculate the amount of tokens available for outputTokenIndex using the totalLiquidity value,
    // taking into account the price range and the pool's current price.

    // Check if there's enough liquidity for exactOutputSingle transaction
    // const hasEnoughLiquidity = outputLiquidity.gte(desiredOutputAmount);

    // return hasEnoughLiquidity;
}

async function getAmountsForLiquidity(token0:Token, token1: Token, outputTokenIndex: number, liquidity: BigintIsh, tickLower: number, tickUpper: number, provider: any) {
    const poolContract = new ethers.Contract(UNISWAP_POOL_ADDRESS, UNISWAP_POOL_ABI, provider);
    const slot0 = await poolContract.slot0();
    const tickLowerPrice = tickToPrice(token0, token1, tickLower);
    const tickUpperPrice = tickToPrice(token0, token1, tickUpper);

    // Calculate the maximum amount of output tokens for the liquidity and price range
    if (outputTokenIndex === 0) {
        // Token0 is the output token
        const temp = tickUpperPrice.divide(tickLowerPrice);
        // const maxRatio = sqrt(JSBI.divide(temp.numerator, temp.denominator));
        const maxRatio = new Fraction(sqrt(temp.numerator), sqrt(temp.denominator));
        return  CurrencyAmount.fromRawAmount(token0, liquidity).multiply(maxRatio);
    } else {
        // Token1 is the output token
        const temp = tickLowerPrice.divide(tickUpperPrice);
        const maxRatio = new Fraction(sqrt(temp.numerator), sqrt(temp.denominator));
        return CurrencyAmount.fromRawAmount(token1, liquidity).multiply(maxRatio);
    }
}
export const TICK_SPACINGS: { [amount in FeeAmount]: number } = {
    [FeeAmount.LOWEST]: 1,
    [FeeAmount.LOW]: 10,
    [FeeAmount.MEDIUM]: 60,
    [FeeAmount.HIGH]: 200
}

const getMinTick = (tickSpacing: number) => Math.ceil(-887272 / tickSpacing) * tickSpacing
const getMaxTick = (tickSpacing: number) => Math.floor(887272 / tickSpacing) * tickSpacing



main()
    .then(() => process.exit(0))
    .catch((e) => {
        console.log('the error is', e);
        process.exit(1)
    });
