import { HardhatRuntimeEnvironment } from 'hardhat/types';

import { MOCKS, MOCKSWITHARGS } from '../../utils/constants';

const getNamedMockAddresses = async (hre: HardhatRuntimeEnvironment): Promise<any> => {
  try {
    const { deployments, getChainId } = hre;
    const chainId = await getChainId();

    if (chainId != '1337') return;

    const namedMockAddresses: Record<any, any> = {};
    for (const key in MOCKS) {
      namedMockAddresses[MOCKS[key]] = (await deployments.get(MOCKS[key])).address;
    }

    for (const key in MOCKSWITHARGS) {
      namedMockAddresses[MOCKSWITHARGS[key]] = (await deployments.get(MOCKSWITHARGS[key])).address;
    }

    return namedMockAddresses;
  } catch (error) {
    console.log(error);
    throw error;
  }
};

export default getNamedMockAddresses;
