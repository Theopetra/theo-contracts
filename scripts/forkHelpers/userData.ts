import hre, {ethers} from 'hardhat';
import { BigNumber } from 'ethers';
import { address as theoAddress, abi as theoAbi} from '../../deployments/mainnet/TheopetraERC20Token.json';
import { Network, Alchemy, Wallet } from 'alchemy-sdk';
import _ from 'lodash';
import * as dotenv from 'dotenv';
import { writeToStream } from "fast-csv";
import fs from 'fs';
dotenv.config();

type data = { timestamp: number, userCount: number };

let unique: string[] = ["0x1fc037ac35af9b940e28e97c2faf39526fbb4556"];
let count = 1;
let dataSet: data[] = [];

async function fetchUserData() {

    // Configuring the Alchemy SDK
    const settings = {
    apiKey: process.env.ALCHEMY_API_KEY, // Replace with your Alchemy API Key.
    network: Network.ETH_MAINNET, // Replace with your network.
    maxRetries: 20
    };

    // Creating an instance to make requests
    const provider = new Alchemy(settings);
    // const provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:8545');
    const wallet = new Wallet(process.env.MAINNET_PRIVATE_KEY ? process.env.MAINNET_PRIVATE_KEY : "", provider);
    // const signer = wallet.connect(provider);
    
    const iface = new ethers.utils.Interface(theoAbi);
    const theo = new ethers.Contract(theoAddress, theoAbi, wallet);

    // Filter for "Transfer" event from contract creation to cutoff date, parse logs, and extract events for the address list
    const logs = await provider.core.getLogs({
        address: theoAddress,
        topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'],
        fromBlock: 15461791,
        toBlock: 17885684             
    });

    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    // Construct timeline: For each transfer event, check the remaining balance of the sender and remove from list and count if it is 0
    // Check if receiving address is unique and if so increment the user count, save the timestamp, and add to list of unique addresses 

    let i = 0;
    const logSet = _.chunk(logs, 10);
    for (const logBatch of logSet) {
        console.log(`Sending batch ${i}...`);
        for (const log of logBatch) {
            let event = iface.parseLog(log)
            let address: string = event.args["from"];
            if (address !== "0x0000000000000000000000000000000000000000" &&
                address !== "0x1fc037ac35af9b940e28e97c2faf39526fbb4556") {
                if (await theo.balanceOf(address, {blockTag: log.blockNumber}) == 0) {
                    unique.splice(unique.indexOf(address), 1);
                    count--;
                };
            };
            if (await uniqueAddress(event.args["to"]) && event.args["value"] > BigNumber.from(0)) {
                unique.push(event.args["to"]);
                count++;
            };
            dataSet.push({ timestamp: log.blockNumber, userCount: count });
            console.log("Count: ", count);
            i++;
        }
        await sleep(2000);
    };
    
    saveResults(dataSet);
    
    return  [ 
            "Addresses:", unique,
            "Timeline: ", dataSet 
            ]
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
