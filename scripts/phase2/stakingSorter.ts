import hre, {ethers} from 'hardhat';
import { address as stakingAddress, abi as stakingAbi } from '../../deployments/staging/TheopetraStakingLocked.json';
import { address as pTheoAddress, abi as pTheoAbi} from '../../deployments/staging/pTheopetra.json';
import { address as batchWithdrawalAddress, abi as batchWithdrawalAbi} from '../../deployments/zkSync/withdrawalBatcher.sol/withdrawalBatcher.json'
import * as dotenv from 'dotenv';
import { BigNumber } from 'ethers';
dotenv.config();

async function sortStakes() {

    // let apikey = process.env.INFURA_API_KEY;
    // let provider = new ethers.providers.InfuraProvider( 1 , apikey );
    
    let provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:8545');
    console.log(provider);

    const iface = new ethers.utils.Interface(stakingAbi);

    const signer = provider.getSigner();
    console.log(signer);

    const stakingContract = new ethers.Contract(stakingAddress, stakingAbi, signer);
    const pTheo = new ethers.Contract(pTheoAddress, pTheoAbi, signer);

    //Filter for "Stake" event from block 17069365, parse logs, extract user list, remove staking contract address, and reduce to unique addresses only 
    const logs = await provider.getLogs({
        address: stakingAddress,
        topics: ['0x5af417134f72a9d41143ace85b0a26dce6f550f894f2cbc1eeee8810603d91b6'],
        fromBlock: 17069365,
        toBlock: 17629916             
    });

    const events = await Promise.all(logs.map((log) => iface.parseLog(log)));
    const users = await Promise.all((events).map(event => event["args"]["user"]));
    const contractFilter = users.filter(user => user !== "0x3b41c244Be7Fe35ac4fFD80615C5524704292263");
    const unique = contractFilter.filter(function (x, i, a) { 
        return a.indexOf(x) == i; 
    });

    // For each user, add up the gonsRemaining of all unredeemed stakes 
    // TODO: convert gons to pTHEO
    const userAmounts = await Promise.all(
        unique.map(async (user: string) => {
            const indexes: number[] = await stakingContract.indexesFor(user, false);
            const amountGons = (await Promise.all(
                indexes.map(async (index: any) => 
                (await stakingContract.stakingInfo(user, index)).gonsRemaining))
                ).reduce((p,c) => (p+c))
            const amount = await pTheo.balanceForGons((amountGons as BigNumber));
            console.log("#", amount);
            return Number(BigInt(amount)).toString();
        })
    )

    const totalAmountStaked = userAmounts.reduce((p: string, c: string) => ((Number(p) + Number(c)).toString()), "0")

    //Change providers to zkSync and instantiate batch withdrawal stakingContract
    // provider = new ethers.providers.InfuraProvider( 324 , apikey );

    // const paymentBatcher = new ethers.Contract(batchWithdrawalAddress, batchWithdrawalAbi, signer);

    // const signer = getSigner()

    return [userAmounts, totalAmountStaked, users]
}

const main = async () => {
    try {
        console.log(await sortStakes());
    } catch (err) {
        console.log(err);
    }
};

main();