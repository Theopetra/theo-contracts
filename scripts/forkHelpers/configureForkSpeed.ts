import { ethers } from 'hardhat';

const setMiningSpeed = async () => {

    const provider = new ethers.providers.JsonRpcProvider('https://mainnet-fork-endpoint-x1gi.onrender.com');

    //Auto: true/false
    const auto = Boolean(process.argv.slice(2)[0]);
    //Speed: in ms
    const speed = Number(process.argv.slice(3)[0]);

    await provider.send("evm_setAutomine", [auto]);

    await provider.send("evm_setIntervalMining", [speed]);

    console.log(`Automine has been set to ${auto} with an interval of ${speed / 1000} seconds`)


};

const configureFork = async () => {
    try {
        await setMiningSpeed();
    } catch (err) {
        console.log(err);
    }
};

configureFork();