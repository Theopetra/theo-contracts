import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import getNamedMockAddresses from './mocks/helpers';
import { CONTRACTS, CAPTABLE, CAPTABLE2, FDVTARGET, TESTWITHMOCKS, UNLOCKSCHEDULE, UNLOCKSCHEDULE2 } from '../utils/constants';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getChainId, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = await getChainId();

  const TheopetraAuthority = await deployments.get(CONTRACTS.authority);
  const TheopetraTreasury = await deployments.get(CONTRACTS.treasury);
  const Theo = await deployments.get(CONTRACTS.theoToken);

  let args: any = [
    TheopetraAuthority.address,
    TheopetraTreasury.address,
    Theo.address,
    FDVTARGET,
    CAPTABLE.addresses,
    CAPTABLE.shares,
    UNLOCKSCHEDULE.times,
    UNLOCKSCHEDULE.amounts,
  ];

  let args2: any = [
    TheopetraAuthority.address,
    TheopetraTreasury.address,
    Theo.address,
    FDVTARGET,
    CAPTABLE2.addresses,
    CAPTABLE2.shares,
    UNLOCKSCHEDULE2.times,
    UNLOCKSCHEDULE2.amounts,
  ];

  // If on Hardhat network, use the following values for testing
  if (chainId === '1337') {
    const captableAddresses = CAPTABLE.addresses;
    captableAddresses[0] = deployer;
    args = [TheopetraAuthority.address, args[1], args[2], args[3], args[4], args[5], args[6], args[7]];
  }

  if (chainId === '1337' && process.env.NODE_ENV === TESTWITHMOCKS) {
    const { TreasuryMock, TheopetraERC20Mock } = await getNamedMockAddresses(hre);
    const captableAddresses = CAPTABLE.addresses;
    captableAddresses[0] = deployer;
    args = [TheopetraAuthority.address, TreasuryMock, TheopetraERC20Mock, args[3], args[4], args[5], args[6], args[7]];
  }

  await deploy(CONTRACTS.founderVesting, {
    from: deployer,
    log: true,
    args,
  });

  await deploy(CONTRACTS.founderVesting, {
    skipIfAlreadyDeployed: false,
    from: deployer,
    log: true,
    args: args2,
  });
};

export default func;
func.tags = [CONTRACTS.founderVesting];
func.dependencies = [CONTRACTS.authority, CONTRACTS.treasury];
