import { ethers } from 'hardhat';
import hre from 'hardhat';
import {BigNumber, BigNumberish} from "ethers";
import {hexZeroPad} from 'ethers/lib/utils';
import UNISWAP_POOL_ABI from '../../phase2/UniswapV3PoolAbi.json';
import UNISWAP_FACTORY_ABI from '../../phase2/NonFungiblePositionManager.json';
import THEOERC20_MAINNET_DEPLOYMENT from '../../../deployments/mainnet/TheopetraERC20Token.json';
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

const UNISWAP_POOL_ADDRESS = "0x1fc037ac35af9b940e28e97c2faf39526fbb4556";
const UNISWAP_NFPM = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';
const governorAddress = '0xb0D6fb365d04FbB7351b2C2796d895eBFDfC422A';

const provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:8544/');

const main = async () => {

    const signer = provider.getSigner();

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

    const deadline = (Date.now()*1000) + 28800;
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
    await removeAllLiquidity(tokenIds, fromAddrs, deadline);

    const UNISWAP_POOL_CONTRACT = new ethers.Contract(UNISWAP_POOL_ADDRESS, UNISWAP_POOL_ABI, signer);
    const liquidity = await UNISWAP_POOL_CONTRACT.liquidity();
    console.log(`Liquidity in pool: ${liquidity}`);
    const blockNumber = await provider.getBlockNumber();
    console.log(`The current block number is: ${blockNumber}`);
      
};

async function removeAllLiquidity(tokenIds: string[][], fromAddrs: string[], deadline: number) {
    const signer = provider.getSigner();
    const UNISWAP_NFPM_CONTRACT = new ethers.Contract(UNISWAP_NFPM, UNISWAP_FACTORY_ABI, signer);

    for (let i = 0; i < tokenIds.length; i++) {
        for (let j = 0; j < tokenIds[i].length; j++) {
            const id = tokenIds[i][j];
            const positionInfo = await UNISWAP_NFPM_CONTRACT.positions(id);
            const poolInfo = await getPoolInfo();

            if (positionInfo.liquidity > 0 && (positionInfo.token0 == THEOERC20_MAINNET_DEPLOYMENT.address || positionInfo.token1 == THEOERC20_MAINNET_DEPLOYMENT.address)) {
                await hre.network.provider.request({
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

const flattenLP = async () => {
    try {
        await main();
    } catch (err) {
        console.log(err);
    }
};

flattenLP();