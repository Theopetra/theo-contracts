import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import {address, abi} from '../../deployments/mainnet/PublicPreListBondDepository.json';
import { BigNumber } from 'ethers';
dotenv.config();

const doTheTest = async () => {
    let [signer, ...signers] =  await ethers.getSigners();
    let contract = await ethers.getContractAt(abi, address, signer);

    let data: BigNumber[] = await contract.getMarkets();

    let locked = [BigNumber.from(0), BigNumber.from(0), BigNumber.from(0)];
    if (data) {
        const merged = await Promise.all(
        data.map(async (b) => {
            return {
            marketId: b,
            market: await contract.markets(b),
            term: await contract.terms(b),
            };
        })
    );

    // 15768000 - 6 months
    // 31536000 - 12 months
    // 47304000 - 18 months

    locked = [15768000, 31536000, 47304000].map((v) => {
      return merged
        .filter((e: any) => e.term.fixedTerm && e.term.vesting === v)
        .reduce((prev, cur: any) => prev.add(cur.market.sold), BigNumber.from(0));
    });
  }

  console.log(`Locked amounts: ${locked}`);
  return locked;

};

const testIt = async () => {
    try {
        await doTheTest();
    } catch (err) {
        console.log(err);
    }
};

testIt();