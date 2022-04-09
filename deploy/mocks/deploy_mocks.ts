import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { CONTRACTS, MOCKS, MOCKSWITHARGS, TESTWITHMOCKS } from '../../utils/constants';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  const chainId = await getChainId();

  // If on Hardhat network, deploy mocks
  if (chainId === '1337') {
    const namedMockAddresses: Record<any, any> = {};
    for (const key in MOCKS) {
      const deployedMock: any = await deploy(MOCKS[key], {
        from: deployer,
        log: true,
      });
      namedMockAddresses[deployedMock.contractName] = deployedMock.address;
    }

    for (const key in MOCKSWITHARGS) {
      let args;
      if (key === 'treasuryMock' || key === 'stakingMock') {
        args = [namedMockAddresses.TheopetraERC20Mock];
      } else if (key === 'bondingCalculatorMock') {
        const TheopetraERC20Token = await deployments.get(CONTRACTS.theoToken);
        const tokenToUse =
          process.env.NODE_ENV === TESTWITHMOCKS ? namedMockAddresses.TheopetraERC20Mock : TheopetraERC20Token.address;

        args = [tokenToUse, namedMockAddresses.UsdcERC20Mock];
      }
      await deploy(MOCKSWITHARGS[key], {
        from: deployer,
        log: true,
        args,
      });
    }
  }
};

export default func;
func.tags = [CONTRACTS.theoToken, 'Mocks'];
