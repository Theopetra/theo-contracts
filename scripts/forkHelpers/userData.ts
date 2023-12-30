import hre, {ethers} from 'hardhat';
import { BigNumber } from 'ethers';
import { address as theoAddress, abi as theoAbi} from '../../deployments/mainnet/TheopetraERC20Token.json';
import { address as wlAddress} from '../../deployments/mainnet/WhitelistTheopetraBondDepository.json';
import { address as plAddress} from '../../deployments/mainnet/PublicPreListBondDepository.json';
import { address as mAddress} from '../../deployments/mainnet/TheopetraBondDepository.json';
import { latestBlock } from '@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time';
import { Network, Alchemy, Wallet, Log } from 'alchemy-sdk';
import _ from 'lodash';
import * as dotenv from 'dotenv';
import { writeToStream } from "fast-csv";
import fs from 'fs';
import { isAddress } from 'ethers/lib/utils';
dotenv.config();

type data = { timestamp: number, userCount: number };

let unique: string[] = ["0x1fc037ac35af9b940e28e97c2faf39526fbb4556"];
let count = 1;
let dataSet: data[] = [];

async function fetchUserData() {

    // Configuring the Alchemy SDK
    // const settings = {
    // apiKey: process.env.ALCHEMY_API_KEY, 
    // network: Network.ETH_MAINNET, 
    // maxRetries: 50 // If script fails due to timeout, increase retries here
    // };

    const endBlock = 18037824;
    const startBlock = 15462213;
    const step = 2000;
    // const mLogs: Log[] = []; // Type error, results in an empty array

    // Creating an instance to make requests
    // const provider = new Alchemy(settings);
    // const provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:8545');
    // const wallet = new Wallet(process.env.MAINNET_PRIVATE_KEY ? process.env.MAINNET_PRIVATE_KEY : "You forgot your env", provider);
    // const signer = wallet.connect(provider);
    
    const iface = new ethers.utils.Interface(theoAbi);
    // const theo = new ethers.Contract(theoAddress, theoAbi, wallet);

    // Account for presale and locked holders using "Bond" event
    // Paginate into 2k block ranges because Alchemy sucks

    // for (let i = 1; i - 1 < (endBlock - startBlock) / step; i++) {
    //     mLogs.concat(await provider.core.getLogs({
    //         address: wlAddress,
    //         topics: ['0x7880508a48fd3aee88f7e15917d85e39c3ad059e51ad4aca9bb46e7b4938b961'],
    //         fromBlock: startBlock + step * (i - 1),
    //         toBlock: startBlock + step * i           
    //     }));

    //     mLogs.concat(await provider.core.getLogs({
    //         address: plAddress,
    //         topics: ['0x7880508a48fd3aee88f7e15917d85e39c3ad059e51ad4aca9bb46e7b4938b961'],
    //         fromBlock: startBlock + step * (i - 1),
    //         toBlock: startBlock + step * i          
    //     }));

    //     mLogs.concat(await provider.core.getLogs({
    //         address: mAddress,
    //         topics: ['0x7880508a48fd3aee88f7e15917d85e39c3ad059e51ad4aca9bb46e7b4938b961'],
    //         fromBlock: startBlock + step * (i - 1),
    //         toBlock: startBlock + step * i          
    //     }));
    // }

    // // Access each transaction from its hash and return addresses
    // const marketUsers = await Promise.all(mLogs.map(
    //     async (log) => await provider.core.getTransaction(log.transactionHash).then(
    //         (transaction) => {return {user: transaction?.from, timestamp: log.blockNumber}}
    // )));

    // console.log("Market users: ", marketUsers, mLogs)

    // saveResults(marketUsers);

    // Filter for "Transfer" event from contract creation to cutoff date, parse logs, and extract events for the address list
    // const theoLogs: Log[] = [];
    // for (let i = 1; i - 1 < (endBlock - startBlock) / step; i++) {    
    //     theoLogs.concat(await provider.core.getLogs({
    //         address: theoAddress,
    //         topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'],
    //         fromBlock: startBlock + step * (i - 1),
    //         toBlock: startBlock + step * i            
    //     }));
    // };
    // console.log("Theo logs: ", theoLogs, "mLogs: ", mLogs);

    // // Construct timeline: For each transfer event, check the remaining balance of the sender and remove from list and count if it is 0
    // // Check if receiving address is unique and if so increment the user count, save the timestamp, and add to list of unique addresses
    // // This loop is kind of a mess but it maintains sequential order in the count

    // let i = 0;
    // let j = 0;
    // const logSet = _.chunk(theoLogs, 10);
    // for (const logBatch of logSet) {
    //     console.log(`Sending batch ${i}...`);
    //     for (const log of logBatch) {
    //         while (j < marketUsers.length && log.blockNumber > marketUsers[j].timestamp) {
    //             if (await uniqueAddress(marketUsers[j].user as string)) {
    //                 unique.push(marketUsers[j].user as string);
    //                 count++;
    //             };
    //             dataSet.push({ timestamp: marketUsers[j].timestamp, userCount: count });
    //             console.log("J Count: ", count, j);
    //             j++
    //         }
    //         let event = iface.parseLog(log)
    //         let address: string = event.args["from"];
    //         if (address !== "0x0000000000000000000000000000000000000000" &&
    //             address !== "0x1fc037ac35af9b940e28e97c2faf39526fbb4556") {
    //             if (await theo.balanceOf(address, {blockTag: log.blockNumber}) == 0) {
    //                 unique.splice(unique.indexOf(address), 1);
    //                 count--;
    //             };
    //         };
    //         if (await uniqueAddress(event.args["to"]) && event.args["value"] > BigNumber.from(0)) {
    //             unique.push(event.args["to"]);
    //             count++;
    //         };
    //         dataSet.push({ timestamp: log.blockNumber, userCount: unique.length });
    //         console.log("I Count: ", count);
    //         i++;
    //     };
    // };
    
    // saveResults(dataSet);
    
    // return  [ 
    //         "Addresses:", unique,
    //         "Timeline: ", dataSet 
    //         ]


    // Infura version for when Alchemy is being shitty
    const provider = new ethers.providers.JsonRpcProvider(`https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`);
    const wallet = new ethers.Wallet(process.env.MAINNET_PRIVATE_KEY ? process.env.MAINNET_PRIVATE_KEY : "You forgot your env", provider);
    const theo = new ethers.Contract(theoAddress, theoAbi, wallet);

    const mLogs = await provider.getLogs({
        address: wlAddress,
        topics: ['0x7880508a48fd3aee88f7e15917d85e39c3ad059e51ad4aca9bb46e7b4938b961'],
        fromBlock: startBlock,
        toBlock: endBlock           
    });

    mLogs.concat(await provider.getLogs({
        address: plAddress,
        topics: ['0x7880508a48fd3aee88f7e15917d85e39c3ad059e51ad4aca9bb46e7b4938b961'],
        fromBlock: startBlock,
        toBlock: endBlock          
    }));

    mLogs.concat(await provider.getLogs({
        address: mAddress,
        topics: ['0x7880508a48fd3aee88f7e15917d85e39c3ad059e51ad4aca9bb46e7b4938b961'],
        fromBlock: startBlock,
        toBlock: endBlock         
    }));

    // Access each transaction from its hash and return addresses
    const marketUsers = await Promise.all(mLogs.map(
        async (log) => await provider.getTransaction(log.transactionHash).then(
            (transaction) => {return {user: transaction?.from, timestamp: log.blockNumber}}
    )));

    console.log("Market users: ", marketUsers)

    saveResults(marketUsers);

}

async function uniqueAddress(user: string) {
    const newList = unique.concat([user]);
    if (new Set(newList).size == newList.length) {
        return true;
    } else return false;
}

function saveResults(rows: any[]) {
    const fsStream = fs.createWriteStream(`./user-results-${new Date().getTime()}.csv`);
    writeToStream(fsStream, rows, { headers: true });
}

const main = async () => {
    try {
        console.log(await fetchUserData());
    } catch (err) {
        console.log(err);
    }
};

main();
