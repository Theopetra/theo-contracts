import { hexZeroPad } from 'ethers/lib/utils';
import { ethers } from 'hardhat';
import hre from 'hardhat';
import BigNumber from 'ethers';
import helpers from '@nomicfoundation/hardhat-network-helpers';

import THEOERC20_MAINNET_DEPLOYMENT from '../../deployments/mainnet/TheopetraERC20Token.json';
import UNISWAP_POOL_ABI from './UniswapV3PoolAbi.json';
import UNISWAP_FACTORY_ABI from './NonFungiblePositionManager.json';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
const UNISWAP_FACTORY_ADDRESS = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';
const UNISWAP_POOL_ADDRESS = "0x1fc037ac35af9b940e28e97c2faf39526fbb4556";

async function main() {

    let provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:8545/');

    let [signer, ...signers] =  await ethers.getSigners();

    let mintFilter = {
        address: UNISWAP_POOL_ADDRESS,
        topics: [
            '0x7a53080ba414158be7ec69b987b5fb7d07dee101fe85488f0853ae16239d0bde',
        ],
        fromBlock: 15460378
    }

    /*  
        Token IDs are reported in Transfer events from the Uniswap factory address, 
        but don't indicate the pool they belong to.

        Mint events in the pool contract are delegated through the factory contract, 
        but the sender can be found through the transaction logs for the event.

        By filtering for the Mint events, accessing the tx hash property and querying the transaction, 
        we can find the sender address and use it to filter transfer events in the factory contract to list all LP position token IDs for the given pool.
    */

    const deadline = 1679580036 + 288000;
    let logPromise = provider.getLogs(mintFilter);
    logPromise.then(function(logs) {
        let txlist = Promise.all(logs.map((log) => (provider.getTransaction(log.transactionHash))));
        
        txlist.then(function(txs) {
            let fromAddrs = Promise.all(txs.map(async (transaction) => transaction.from));

            fromAddrs.then(async (fromAddrs) => {
            fromAddrs.forEach(item => console.log(item.toString()));

            let eventsList = await Promise.all(fromAddrs.map(fromAddr => {
                    
                let transferFilter = {
                    address: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
                    topics: [
                    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', 
                    null, 
                    hexZeroPad(fromAddr, 32)],
                    fromBlock: 15460379                    
                };

                let eventPromise = provider.getLogs(transferFilter);
                return eventPromise;
            }));    

            let tokenIdsForAddr = Promise.all(eventsList.map(async (event) => Promise.all(event.map(async (event) => event.topics[3]))))
            tokenIdsForAddr.then((tokenIds) => 
            removeAllLiquidity(tokenIds, fromAddrs, signer, deadline).then(() => 
            console.log("Done")));
            });
        });    
    });
};

    async function removeAllLiquidity(tokenIds: string[][], fromAddrs: string[], signer: SignerWithAddress, deadline: number) {
        const UNISWAP_FACTORY_CONTRACT = await ethers.getContractAt(UNISWAP_FACTORY_ABI, UNISWAP_FACTORY_ADDRESS);
        const UNISWAP_POOL_CONTRACT = await ethers.getContractAt(UNISWAP_POOL_ABI, UNISWAP_POOL_ADDRESS, signer);
        
        tokenIds.forEach(async (id, i) => {
            id.forEach(async (id) => {

                let positionInfo = await UNISWAP_FACTORY_CONTRACT.positions(id);

                if (positionInfo.token0 == THEOERC20_MAINNET_DEPLOYMENT.address || positionInfo.token1 == THEOERC20_MAINNET_DEPLOYMENT.address) {
                    await hre.network.provider.request({
                        method: "hardhat_impersonateAccount",
                        params: [fromAddrs[i]],
                    });

                    let impersonatedSigner = await ethers.getSigner(fromAddrs[i]);
                    UNISWAP_POOL_CONTRACT.connect(impersonatedSigner);
                    
                    let removeArgs = [
                        "0x0c49ccbe",
                        id,
                        positionInfo.liquidity,
                        "0",
                        "0",
                        deadline,
                    ];

                    let collectArgs = [
                        "0x4f1eb3d8",
                        fromAddrs[i],
                        positionInfo.tickLower,
                        positionInfo.tickUpper,
                        "170141183460469231731687303715884105727",
                        "170141183460469231731687303715884105727",
                    ];

                    console.log(removeArgs, collectArgs);
                    console.log(positionInfo);

                    await UNISWAP_FACTORY_CONTRACT.multicall(collectArgs, removeArgs);
                    // console.log(await UNISWAP_POOL_CONTRACT.maxLiquidityPerTick);
                }
            })
        })
    }

main();