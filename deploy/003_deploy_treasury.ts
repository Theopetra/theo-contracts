import hre from 'hardhat';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { MOCKSWITHARGS, MOCKS } from '../utils/constants';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  const chainId = await getChainId();
  let args: any = [];

  // If on Hardhat network, update args with addresses of already-deployed mocks
  if (chainId === '1337') {
    const namedMockAddresses: Record<any, any> = {};

    for (const key in MOCKS) {
      try {
        namedMockAddresses[MOCKS[key]] = (await deployments.get(MOCKS[key])).address;
      } catch (error) {
        console.log(error);
      }
    }

    for (const key in MOCKSWITHARGS) {
      let args;
      if (key === 'treasuryMock' || key === 'stakingMock') {
        args = [namedMockAddresses.TheopetraERC20Mock];
      }
      const deployedMock: any = await deploy(MOCKSWITHARGS[key], {
        from: deployer,
        log: true,
        args,
      });
      namedMockAddresses[deployedMock.contractName] = deployedMock.address;
    }

    const { TheopetraERC20Mock, BondDepoMock } = namedMockAddresses;
    args = [TheopetraERC20Mock, deployer, deployer];
  }

  await deploy('TheopetraTreasury', {
    from: deployer,
    log: true,
    args: args,
  });
};

export default func;
func.tags = ['TheopetraTreasury'];
func.dependencies = hre?.network?.config?.chainId === 1337 ? ['Mocks'] : [];
