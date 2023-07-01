import hre, {ethers} from 'hardhat';
import { address as stakingAddress, abi as stakingAbi } from '../../deployments/staging/TheopetraStakingLocked.json';
// import { address as batchWithdrawalAddress, abi as batchWithdrawalAbi} from '../../deployments/zksync/'
import * as dotenv from 'dotenv';
dotenv.config();

// export interface StakingInfo {
//     deposit?: bigint;
//     gonsInWarmup?: bigint;
//     warmupExpiry?: bigint;
//     stakingExpiry?: bigint;
//     gonsRemaining?: bigint;
//   }

async function sortStakes() {

    // let apikey = process.env.INFURA_API_KEY;

    // let provider = new ethers.providers.InfuraProvider( 1 , apikey );
    const provider = new ethers.providers.JsonRpcProvider('https://mainnet-fork-endpoint-x1gi.onrender.com');

    const iface = new ethers.utils.Interface(stakingAbi);

    const signer = provider.getSigner();

    const contract = new ethers.Contract(stakingAddress, stakingAbi, signer);

    //Filter for "Stake" event from block 17069365, parse logs, extract user list and reduce to unique addresses only 
    const logs = await provider.getLogs({
        address: stakingAddress,
        topics: ['0x5af417134f72a9d41143ace85b0a26dce6f550f894f2cbc1eeee8810603d91b6'],
        fromBlock: 17069365            
    });

    const events = await Promise.all(logs.map((log) => iface.parseLog(log)));
    const users = await Promise.all((events).map(event => event["args"]["user"]));
    const unique = users.filter(function (x, i, a) { 
        return a.indexOf(x) == i; 
    });

    // For each user, add up the gonsRemaining of all unredeemed stakes 
    const userAmounts = await Promise.all(
        unique.map(async (user: string) => {
            const indexes: number[] = await contract.indexesFor(user, false);
            const amount = (await Promise.all(
                indexes.map(async (index: any) => 
                (await contract.stakingInfo(user, index)).gonsRemaining)
                )).reduce((p,c) => (p+c))
            console.log("#", amount)
            return amount;
        })
    )

    const totalAmountStaked = userAmounts.reduce((p: number, c: number) => (p + c), 0)

    //Change providers to zkSync and instantiate batch withdrawal contract
    // provider = new ethers.providers.InfuraProvider( 324 , apikey );

    // // const signer = getSigner from mnnemonic.txt 

    // const batchContract = new ethers.Contract(batchWithdrawalAddress, batchWithdrawalAbi, signer)

    return [userAmounts, totalAmountStaked, users]
}

const main = async () => {
    try {
        await sortStakes();
    } catch (err) {
        console.log(err);
    }
};

main();