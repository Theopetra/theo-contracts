import { ethers } from 'hardhat';
import {address, abi} from '../../deployments/mainnet/TheopetraBondDepository.json';

const getInfo = async () => {

    const provider = new ethers.providers.JsonRpcProvider('https://mainnet-fork-endpoint-x1gi.onrender.com');
    const signer = provider.getSigner();
    const contract = await ethers.getContractAt(abi, address, signer);
    const liveMarkets: any[] = await contract.liveMarkets();

    if ((process.argv.slice(2)[0])) {
        console.log(await contract.markets(parseInt(process.argv.slice(2)[0])));
        console.log(await contract.terms(parseInt(process.argv.slice(2)[0])));
    } else {
        for (const i in liveMarkets) {
            console.log(await contract.markets(liveMarkets[i]));
            console.log(await contract.terms(liveMarkets[i]));
        }
    }

};

const marketInfo = async () => {
    try {
        await getInfo();
    } catch (err) {
        console.log(err);
    }
};

marketInfo();