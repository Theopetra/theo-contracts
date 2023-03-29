import * as dotenv from 'dotenv';
import hre from 'hardhat';
dotenv.config();

const setMiningSpeed = async () => {

    //Auto: true/false
    const auto = Boolean(process.argv.slice(2)[0]);
    //Speed: in ms
    const speed = Number(process.argv.slice(3)[0]);

    await hre.network.provider.send("evm_setAutomine", [auto]);

    await hre.network.provider.send("evm_setIntervalMining", [speed]);

};

const configureFork = async () => {
    try {
        await setMiningSpeed();
    } catch (err) {
        console.log(err);
    }
};

configureFork();