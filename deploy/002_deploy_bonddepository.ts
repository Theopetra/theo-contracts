import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { CONTRACTS, MOCKS, MOCKSWITHARGS } from '../utils/constants';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getChainId, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const TheopetraAuthority = await deployments.get(CONTRACTS.authority);
  const { deployer } = await getNamedAccounts();
  const chainId = await getChainId();
  const args = [TheopetraAuthority.address, deployer, deployer, deployer, deployer];

  // If on Hardhat network, deploy mocks and update args with mocks' addresses
  if (chainId === '1337') {
    const namedMockAddresses: Record<string, string> = {};
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
        args = [namedMockAddresses.TheopetraERC20Mock]
      }
      
      const deployedMock: any = await deploy(MOCKSWITHARGS[key], {
        from: deployer,
        log: true,
        args,
      });
      namedMockAddresses[deployedMock.contractName] = deployedMock.address;
    }
    
    const { TheopetraERC20Mock, sTheoMock, StakingMock, TreasuryMock } = namedMockAddresses;
    args.splice(1, 4, TheopetraERC20Mock, sTheoMock, StakingMock, TreasuryMock);
  }

  await deploy(CONTRACTS.bondDepo, {
    from: deployer,
    log: true,
    args,
  });
};

export default func;
func.tags = [CONTRACTS.bondDepo];
func.dependencies = [CONTRACTS.authority];
