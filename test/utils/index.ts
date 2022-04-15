import { Contract, Event } from 'ethers';
import { LogDescription } from "@ethersproject/abi";
import { ethers } from 'hardhat';
import { TheopetraTreasury, TheopetraYieldReporter, YieldReporterMock } from '../../typechain-types';



export async function setupUsers<T extends { [contractName: string]: Contract }>(
  addresses: string[],
  contracts: T
): Promise<({ address: string } & T)[]> {
  const users: ({ address: string } & T)[] = [];
  for (const address of addresses) {
    users.push(await setupUser(address, contracts));
  }
  return users;
}

export async function setupUser<T extends { [contractName: string]: Contract }>(
  address: string,
  contracts: T
): Promise<{ address: string } & T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user: any = { address };
  for (const key of Object.keys(contracts)) {
    user[key] = contracts[key].connect(await ethers.getSigner(address));
  }
  return user as { address: string } & T;
}

export async function waitFor<T>(p: Promise<{ wait: () => Promise<T> }>): Promise<T> {
  const tx = await p;
  return tx.wait();
}

export async function moveTimeForward<T>(timeInSeconds: number): Promise<void & T> {
  const latestBlock = await ethers.provider.getBlock('latest');
  const newTimestampInSeconds = latestBlock.timestamp + timeInSeconds;
  await ethers.provider.send('evm_mine', [newTimestampInSeconds]);
}

export function decodeLogs(logs: Event[], targets: Contract[]): LogDescription[] {

  const decoded: LogDescription[] = [];

  logs.forEach((log) => {
    const contract = targets.find((c: Contract) => c.address === log.address);
    if (!contract) return;
    decoded.push(contract.interface.parseLog(log));
  });

  return decoded;
}

export async function performanceUpdate<T>(
  Treasury: TheopetraTreasury,
  YieldReporter: TheopetraYieldReporter | YieldReporterMock,
  BondingCalculatorAddress: string
): Promise<void & T> {
  const addressZero = ethers.utils.getAddress('0x0000000000000000000000000000000000000000');
  // Set the address of the bonding calculator
  await Treasury.setTheoBondingCalculator(BondingCalculatorAddress);

  // Move forward 8 hours to allow tokenPerformanceUpdate to update contract state for token price
  // current token price will subsequently be updated, last token price will still be zero
  await moveTimeForward(60 * 60 * 8);
  await Treasury.tokenPerformanceUpdate();
  // Move forward in time again to update again, this time current token price becomes last token price
  await moveTimeForward(60 * 60 * 8);
  await Treasury.tokenPerformanceUpdate();

  // Set the Bonding Calculator address (used previously just to update token performance) back to address zero, to allow unit testing from this state
  await Treasury.setTheoBondingCalculator(addressZero);

  // If not using the mock, report a couple of yields using the Yield Reporter (for use when calculating deltaTreasuryYield)
  // Difference in reported yields is chosen to be relatively low, to avoid hiting the maximum rate (cap) when calculating the nextRewardRate
  await waitFor(YieldReporter.reportYield(50_000_000_000));
  await waitFor(YieldReporter.reportYield(65_000_000_000));
}
