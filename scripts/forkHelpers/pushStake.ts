import * as dotenv from 'dotenv';
import hre from 'hardhat';
import { ethers } from 'hardhat';
import {address, abi} from '../../deployments/mainnet/pTheopetra.json';
import {address as stakingAddress, abi as stakingAbi} from '../../deployments/mainnet/TheopetraStakingLocked.json';
import {address as treasuryAddress} from '../../deployments/mainnet/TheopetraTreasury.json'
const BigNumber = ethers.BigNumber;
dotenv.config();

const getForkedTheo = async () => {

    // Setup default user and impersonate calls
    let user = '0x06f3a31e675ddFEBafC87435686E63C156E2236C';
    
    if (ethers.utils.isAddress(process.argv.slice(2)[0])) {
        user = process.argv.slice(2)[0];
    }

    let recipient = '0xddea2099A20961fDf1E0ce927D42e9B5020DB11A';

    if (ethers.utils.isAddress(process.argv.slice(3)[0])) {
        recipient = process.argv.slice(3)[0];
    }

    let index = 0;

    if (process.argv.slice(4)[0]) {
        index = Number(process.argv.slice(4)[0]);
    }

    console.log("Index: ", index, "Sender: ", user, "Recipient: ", recipient);

    const provider = new ethers.providers.JsonRpcProvider('https://mainnet-fork-endpoint-x1gi.onrender.com');

    let signer = provider.getSigner(user);
    const pTheo = await ethers.getContractAt(abi, address, signer);
    const staking = await ethers.getContractAt(stakingAbi, stakingAddress, signer);

    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [user],
    });

    let amountGons = await staking.stakingInfo(user, index);
    console.log(amountGons.gonsRemaining);
    let amount = await pTheo.balanceForGons(amountGons.gonsRemaining);
    console.log(amount);

    // await staking.pushClaim(recipient, index);
    // await pTheo.transfer(recipient, amount);

    signer = provider.getSigner(recipient);
    staking.connect(signer);

    const staking2 = await ethers.getContractAt(stakingAbi, stakingAddress, signer);

    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [recipient],
    });

    await staking2.pullClaim(user, index);
    

    console.log(`Successfully transferred $pTHEO to new owner`);
};

const main = async () => {
    try {
        await getForkedTheo();
    } catch (err) {
        console.log(err);
    }
};

main();