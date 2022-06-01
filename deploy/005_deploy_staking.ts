import hre from 'hardhat';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';

import { CONTRACTS, MOCKS, TESTWITHMOCKS } from '../utils/constants';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  try {
    const { deployments, getChainId, getNamedAccounts } = hre;
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();
    const chainId = await getChainId();

    const TheopetraAuthority = await deployments.get(CONTRACTS.authority);
    const TheopetraERC20Token = await deployments.get(CONTRACTS.theoToken);
    const sTheopetraERC20 = await deployments.get(CONTRACTS.sTheo);
    const Treasury = await deployments.get(CONTRACTS.treasury);

    // staking term is seconds in a year
    const stakingTerm = 0;

    const epochLength = 8 * 60 * 60;
    const firstEpochNumber = '1';
    const currentBlock = await ethers.provider.send('eth_blockNumber', []);
    const blockTimestamp = (await ethers.provider.getBlock(currentBlock)).timestamp;
    let firstEpochTime = blockTimestamp + epochLength;
    let args: any = [];

    args = [
      TheopetraERC20Token.address,
      sTheopetraERC20.address,
      epochLength,
      firstEpochNumber,
      firstEpochTime,
      stakingTerm,
      TheopetraAuthority.address,
      Treasury.address,
    ];

    if (chainId === '1337' && process.env.NODE_ENV === TESTWITHMOCKS) {
      // If using mocks, then set the rebase far enough in the future to not hit it in tests
      firstEpochTime = blockTimestamp + 60 * 60 * 24 * 30;
      // Update args with addresses of already-deployed mocks
      const namedMockAddresses: Record<any, any> = {};
      for (const key in MOCKS) {
        try {
          namedMockAddresses[MOCKS[key]] = (await deployments.get(MOCKS[key])).address;
        } catch (error) {
          console.log(error);
        }
      }
      const { TheopetraERC20Mock, sTheoMock } = namedMockAddresses;
      args = [
        TheopetraERC20Mock,
        sTheoMock,
        epochLength,
        firstEpochNumber,
        firstEpochTime,
        stakingTerm,
        TheopetraAuthority.address,
        Treasury.address,
      ];
    }

    await deploy(CONTRACTS.staking, {
      from: deployer,
      log: true,
      args,
    });
  } catch (error) {
    console.log(error);
  }
};

export default func;
func.tags = [CONTRACTS.staking];
func.dependencies =
  hre?.network?.config?.chainId === 1337
    ? [CONTRACTS.authority, 'Mocks']
    : [CONTRACTS.authority, CONTRACTS.theoToken, CONTRACTS.sTheo];
