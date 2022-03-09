import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { CONTRACTS, MOCKS } from '../utils/constants';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  try {
    const { deployments, getChainId, getNamedAccounts } = hre;
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();
    const chainId = await getChainId();

    const TheopetraAuthority = await deployments.get(CONTRACTS.authority);

    let epochLengthInBlocks;
    let firstEpochNumber;
    let firstEpochBlock;
    let args: any = [];

    // If on Hardhat network, use the following values for testing
    if (chainId === '1337') {
      epochLengthInBlocks = '2000';
      firstEpochNumber = '1';
      firstEpochBlock = '10000'; // Sets the rebase far enough in the future to not hit it in tests

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
        epochLengthInBlocks,
        firstEpochNumber,
        firstEpochBlock,
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
