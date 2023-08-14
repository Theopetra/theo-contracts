import hre, {ethers} from 'hardhat';
import { address as theoAddress, abi as theoAbi} from '../../deployments/mainnet/TheopetraERC20Token.json';
import { address as pTheoAddress, abi as pTheoAbi} from '../../deployments/staging/pTheopetra.json';
import { Network, Alchemy, Wallet } from 'alchemy-sdk';
import _ from 'lodash';
import * as dotenv from 'dotenv';
import { writeToStream } from "fast-csv";
import fs from 'fs';
dotenv.config();

type data = { timestamp: number, userCount: number };

let unique: string[] = [];
let count = 0;
let dataSet: data[] = [];

async function fetchUserData() {

    // Configuring the Alchemy SDK
    const settings = {
    apiKey: process.env.ALCHEMY_API_KEY, // Replace with your Alchemy API Key.
    network: Network.ETH_MAINNET, // Replace with your network.
    };

    // Creating an instance to make requests
    const provider = new Alchemy(settings);
    // const provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:8545');
    const wallet = new Wallet(process.env.MAINNET_PRIVATE_KEY ? process.env.MAINNET_PRIVATE_KEY : "", provider);
    // const signer = wallet.connect(provider);
    
    const iface = new ethers.utils.Interface(theoAbi);
    const theo = new ethers.Contract(theoAddress, theoAbi, wallet);
    // const pTheo = new ethers.Contract(pTheoAddress, pTheoAbi, signer);

    // Filter for "Transfer" event from contract creation to cutoff date, parse logs, extract user list and time, and reduce to unique addresses only, and plot based on time 
    const logs = await provider.core.getLogs({
        address: theoAddress,
        topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'],
        fromBlock: 15461791,
        toBlock: 17885684             
    });

    const events = await Promise.all(logs.map((log) => iface.parseLog(log)));
    const logSet = _.chunk(logs, 100);
    // const users = await Promise.all((events).map((event, i) => event["args"]["user"]));
    // const unique = users.filter(async function (x, i, a) { 
    //     return (a.indexOf(x) == i)
    // });

    // Construct timeline: For each transfer event, check the remaining balance of the sender and remove from list if it is 0
    // Check if receiving address is unique and if so increment the user count and save the timestamp 

    // await Promise.all(
    //     logSet.map((logBatch, i) => {
    //         console.log(`Sending batch ${i}...`);
    //         Promise.all(logBatch.map(async (log, i) => {
    //             let address: string = events[i].args["from"];
    //             if (address !== "0x0000000000000000000000000000000000000000" && 
    //                 await theo.balanceOf(address, {blockTag: log.blockNumber}) == 0) {
    //                 count--
    //             };
    //             if (await uniqueAddress(events[i].args["to"])) {
    //                 count++
    //             };
    //             dataSet.push({ timestamp: log.blockNumber, userCount: count })
    //             // return { timestamp: log.blockNumber, userCount: count }
    //             })) 
    //         // return timeline;
    //     })
    // );

    // Fucks up at 100 because the loop is batched, need to batch address/events as well
        
    for (const logBatch of logSet) {
        let i = 0;
        console.log("Sending batch...");
        await Promise.all(logBatch.map(async (log) => {
            let address: string = events[i].args["from"];
            if (address !== "0x0000000000000000000000000000000000000000" && 
                await theo.balanceOf(address, {blockTag: log.blockNumber}) == 0) {
                unique.splice(unique.indexOf(address), 1);
                count--;
            };
            if (await uniqueAddress(events[i].args["to"])) {
                unique.push(events[i].args["to"]);
                count++;
            };
            dataSet.push({ timestamp: log.blockNumber, userCount: count });
            i++;
        }));
    };

    saveResults(dataSet);
    
    return  [ 
            "Addresses:", unique,
            "Timeline: ", dataSet 
            ]
}

async function uniqueAddress(user: string) {
    const uniqueList = unique.concat([user]);
    if (new Set(uniqueList).size == uniqueList.length) {
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
