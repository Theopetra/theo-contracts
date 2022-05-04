import hre from 'hardhat';

const rinkebyInfo = async () => {
  const accounts = await hre.ethers.getSigners();
  const provider = await hre.ethers.getDefaultProvider('rinkeby');
  console.log(provider.network, accounts);
};

const getRinkebyInfo = async () => {
  try {
      await rinkebyInfo();
      process.exit(0);
  } catch (err) {
      console.log(err);
      process.exit(1);
  }
};

getRinkebyInfo();
