import hre, {ethers} from 'hardhat';
import { address as stakingAddress, abi as stakingAbi } from '../../deployments/staging/TheopetraStakingLocked.json';
import { address as pTheoAddress, abi as pTheoAbi} from '../../deployments/staging/pTheopetra.json';
import { address as batchWithdrawalAddress, abi as batchWithdrawalAbi} from '../../deployments/zkSync/withdrawalBatcher.sol/withdrawalBatcher.json'
import * as dotenv from 'dotenv';
dotenv.config();

async function sortStakes() {

    // let apikey = process.env.INFURA_API_KEY;
    // let provider = new ethers.providers.InfuraProvider( 1 , apikey );
    let provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:8545');
    let signer = provider.getSigner();

    let rebate = BigInt(0);
    if (process.argv.slice(2)[0]) {
            rebate = BigInt(process.argv.slice(2)[0]);
    }
    
    const iface = new ethers.utils.Interface(stakingAbi);
    const pTheo = new ethers.Contract(pTheoAddress, pTheoAbi, signer);

    // Filter for "Stake" event from contract creation to cutoff date, parse logs, extract user list, remove staking contract address, and reduce to unique addresses only 
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

    // For each user, query pTHEO balance and sum the total
    const userAmounts = await Promise.all(
        unique.map(async (user: string) => {
            const amount = await pTheo.balanceOf(user)
            return Number(BigInt(amount)).toString();
        })
    );

    const totalAmountStaked = userAmounts.reduce((p: string, c: string) => ((Number(p) + Number(c)).toString()), "0");

    // TODO: Sort and filter top 4000 addresses only

    // Change providers to zkSync and instantiate batch withdrawal stakingContract
    provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:8544');
    const rebateSigner = new ethers.Wallet(`${process.env.MAINNET_PRIVATE_KEY}`, provider)

    // Goerli
    // const paymentBatcher = new ethers.Contract("0x97D3aa40b1DB09F783C25C4b142A6D9446d50f07", batchWithdrawalAbi, rebateSigner)
   
    // Mainnet
    const paymentBatcher = new ethers.Contract(batchWithdrawalAddress, batchWithdrawalAbi, rebateSigner);

    // Account for gas cost for current rebate and reduce rebate by that amount
    const feeData = await provider.getFeeData();
    // Placeholder data for estimation
    const estimateProportions = (new Array(unique.length)).fill(1000);
    const gas = (await provider.estimateGas(paymentBatcher.batch(unique, estimateProportions, {gasPrice: feeData.gasPrice, value: rebate}))).toBigInt();
    rebate = rebate - gas * (feeData.gasPrice?.toBigInt() || BigInt(0));
    console.log("Gas adjusted rebate:", rebate, gas, feeData.gasPrice);

    const userProportions = await Promise.all(
        unique.map(async (user: string, i) => {
            // Decimal adjustment is to preserve precision on bigints
            return ((((BigInt(userAmounts[i]) * BigInt(10**18)) / BigInt(totalAmountStaked) * rebate) / BigInt(10**18))) 
        })
    );
    
    const max = userProportions.reduce((m, e) => e > m ? e : m);
    const min = userProportions.reduce((m, e) => e < m ? e : m);

    // Send the rebate and return data
    await paymentBatcher.batch(unique, userProportions, {value: rebate});
    
    return ["Amounts staked:", userAmounts,
            "Rebate amounts:", userProportions, 
            "Total amount staked:", totalAmountStaked, 
            "Addresses:", unique, 
            "Highest rebate:", max,
            "Lowest rebate:", min,
            "Gas Estimate:", gas]
}

const main = async () => {
    try {
        console.log(await sortStakes());
    } catch (err) {
        console.log(err);
    }
};

main();


    /* Unused, but here's how to get the staked balance from gons 
    const stakingContract = new ethers.Contract(stakingAddress, stakingAbi, signer);
    const indexes: number[] = await stakingContract.indexesFor(user, false);
            (await Promise.all(
                indexes.map(async (index: any) => {
                    const gons = await stakingContract.stakingInfo(user, index)
                    console.log(gons.gonsRemaining)
                    const bal = await pTheo.balanceForGons(gons.gonsRemaining as BigNumber)
                    return bal
                }))).reduce((p,c) => (p+c)); 
    */