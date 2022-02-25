import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { CONTRACTS, MOCKS } from '../utils/constants';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getChainId, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const TheopetraAuthority = await deployments.get(CONTRACTS.authority);
  const { deployer } = await getNamedAccounts();
  const chainId = await getChainId();
  const args = [TheopetraAuthority.address, deployer, deployer, deployer, deployer];

  // If on Hardhat network, deploy mocks and update args with mocks' addresses
  if (chainId === '1337') {
    const theoTokenMock = await deploy(MOCKS.theoTokenMock, {
      from: deployer,
      log: true,
    });
    await deploy(MOCKS.usdcTokenMock, {
      from: deployer,
      log: true,
    });
    const TreasuryMock = await deploy(MOCKS.treasuryMock, {
      from: deployer,
      log: true,
    });
    const StakingMock = await deploy(MOCKS.stakingMock, {
      from: deployer,
      log: true,
    });
    const gTheoMock = await deploy(MOCKS.gTheoMock, {
      from: deployer,
      log: true,
    });

    args.splice(1, 4, theoTokenMock?.address, gTheoMock?.address, StakingMock?.address, TreasuryMock?.address);
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
