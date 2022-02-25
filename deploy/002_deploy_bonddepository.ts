import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { CONTRACTS, MOCKS } from '../utils/constants';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getChainId, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  const chainId = await getChainId();
  const args = [deployer, deployer, deployer, deployer, deployer]

  // If on Hardhat network, deploy mocks and update args with mocks' addresses
  if (chainId === '1337') {
    const theoTokenMock = await deploy(MOCKS.theoTokenMock, {
      from: deployer,
      log: true,
    })
    await deploy(MOCKS.usdcTokenMock, {
      from: deployer,
      log: true,
    })
    const TreasuryMock = await deploy(MOCKS.treasuryMock, {
      from: deployer,
      log: true,
    })
    const TheopetraAuthority = await deploy(CONTRACTS.authority, {
      from: deployer,
      log: true,
      args: [deployer, deployer, deployer, deployer],
    })
    args[0] = TheopetraAuthority?.address;
    args[1] = theoTokenMock?.address;
    args[4] = TreasuryMock?.address;
  }

  await deploy(CONTRACTS.bondDepo, {
    from: deployer,
    log: true,
    args,
  });
};

export default func;
func.tags = [CONTRACTS.bondDepo];