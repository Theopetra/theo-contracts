import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from "hardhat";

import { CONTRACTS, MOCKS } from '../utils/constants';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  try {
    const { deployments, getChainId, getNamedAccounts } = hre;
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();
    const chainId = await getChainId();

    const TheopetraAuthority = await deployments.get(CONTRACTS.authority);

    let epochLength;
    let firstEpochNumber;
    let firstEpochTime;
    let args: any = [];

    // If on Hardhat network, use the following values for testing
    if (chainId === '1337') {
      epochLength = 8 * 60 * 60;
      firstEpochNumber = '1';

      const currentBlock = await ethers.provider.send("eth_blockNumber", []);
      const blockTimestamp = (await ethers.provider.getBlock(currentBlock)).timestamp;
      firstEpochTime = blockTimestamp + 10000; // set the rebase far enough in the future to not hit it in tests

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
        TheopetraAuthority.address,
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
func.dependencies = [CONTRACTS.authority];
