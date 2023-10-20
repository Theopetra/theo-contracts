import { ethers } from 'ethers'
import * as dotenv from 'dotenv';
import { writeToStream } from "fast-csv";
import 'isomorphic-fetch';
import fs from 'fs';
import { latestBlock } from '@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time';
dotenv.config();

type data = { timestamp: number, TVL: number };
let dataSet: data[] = [];

async function fetchTVLData() {

    const endpoint = `https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3`
    const startBlock = 16759345 
    const step = 1200
    const endBlock = await latestBlock()

    for (let i = 0; i < (endBlock - startBlock) / step; i++) {

    await fetch(endpoint, {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `
        query {
            pool(
                id: "0x1fc037ac35af9b940e28e97c2faf39526fbb4556",
                block: {number: ${startBlock + i * step}}
            )   {
                totalValueLockedUSD
                }
            }` 
      })
    })
    .then(res => res.json())
    .then(res => { dataSet.push({timestamp: startBlock + i * step, TVL: res.data.pool.totalValueLockedUSD}), console.log(res.data, `${i} / ${Math.floor((endBlock - startBlock) / step)}`);});
    };

    saveResults(dataSet);

    return [dataSet]
    
}

function saveResults(rows: any[]) {
    const fsStream = fs.createWriteStream(`./TVL-results-${new Date().getTime()}.csv`);
    writeToStream(fsStream, rows, { headers: true });
}

const main = async () => {
    try {
        console.log(await fetchTVLData());
    } catch (err) {
        console.log(err);
    }
};

main();
