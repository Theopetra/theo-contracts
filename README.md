# Theopetra Protocol - Smart Contracts

### Prerequisites
- Node v16
- Yarn 3.1.0

### TLDR; How do i get started?
1. Contracts go in `src` directory
2. `yarn compile` compiles the solidity contracts
3. `yarn test` compiles contracts and runs tests located under `test` directory.


The Theopetra Protocol is built using solidity, leverages the hardhat development environment and the following packages:

Package | Description
---|---
Hardhat<sup>1</sup> | 💻 [Ethereum development environment](https://hardhat.org/)
Hardhat Deploy  | 🚀 [Hardhat Plugin For Replicable Deployments And Easy Testing](https://github.com/wighawag/hardhat-deploy#readme)
Ethers | 🔌 [A compact library for interacting with the Ethereum Blockchain ](https://docs.ethers.io/v5/)
TypeChain |  [ΞTH 🤝 TypeScript](https://github.com/dethcrypto/TypeChain)
Mocha  | 🤖 [JS Testing Environment](https://mochajs.org/)
ESLint | 📝 [JS Linting](https://eslint.org/)
SOLHint | 📝 [Solidity Linting](https://github.com/protofire/solhint)
solidity-coverage | ✅ [Code Coverage](https://github.com/sc-forks/solidity-coverage)
hardhat-gas-reporter | ⛽️ [Contract Gas Usage](https://github.com/cgewecke/hardhat-gas-reporter#readme)


To get started, try running some of the following tasks after running `yarn`:

```shell
npx hardhat accounts
npx hardhat compile
npx hardhat clean
npx hardhat test
npx hardhat node
npx hardhat help
REPORT_GAS=true npx hardhat test
npx hardhat coverage
npx hardhat run scripts/deploy.ts
TS_NODE_FILES=true npx ts-node scripts/deploy.ts
npx eslint '**/*.{js,ts}'
npx eslint '**/*.{js,ts}' --fix
npx prettier '**/*.{json,sol,md}' --check
npx prettier '**/*.{json,sol,md}' --write
npx solhint 'contracts/**/*.sol'
npx solhint 'contracts/**/*.sol' --fix
```

Script | Description
---|---
`yarn prepare` | Standard lifecycle npm script. Executed automatically upon install. Generates TypeChain files from smart contracts.
`yarn dev` | Starts Hardhat development server.
`yarn test` | Execute tests located in `test` folder. Can also pass extra arguments to mocha
`yarn build` | Cleans then runs `yarn compile`
`yarn compile` | Compiles smart contract artifacts
`yarn deploy` | usage: `yarn deploy <network> [args...]`. Deploys compiled smart contracts to target network.
`yarn lint`, `yarn lint:fix`, `yarn format` and `yarn format:fix` | Formats code. `:fix` will modify the files to match the requirement specified in .eslintrc and .prettierrc.
`yarn void:deploy` | This will deploy your contracts on the in-memory hardhat network and exit, leaving no trace.
`yarn local:dev` | Assumes local node running on localhost:8545 and deploys the contracts to it. Watches for changes and redeploys.
`yarn execute <network> <file.ts> [args...]` | Executes the script `<file.ts>` against the specified network.
`yarn fork:*` |  Forks the specified network, Runs corresponding yarn task against forked network. i.e. `fork:deploy` deploys to forked network.



# Etherscan verification

To try out Etherscan verification, you first need to deploy a contract to an Ethereum network that's supported by Etherscan, such as Ropsten.

In this project, copy the .env.example file to a file named .env, and then edit it to fill in the details. Enter your Etherscan API key, your Ropsten node URL (eg from Alchemy), and the private key of the account which will send the deployment transaction. With a valid .env file in place, first deploy your contract:

```shell
hardhat run --network ropsten scripts/sample-script.ts
```

Then, copy the deployment address and paste it in to replace `DEPLOYED_CONTRACT_ADDRESS` in this command:

```shell
npx hardhat verify --network ropsten DEPLOYED_CONTRACT_ADDRESS "Hello, Hardhat!"
```

# Performance optimizations

For faster runs of your tests and scripts, consider skipping ts-node's type checking by setting the environment variable `TS_NODE_TRANSPILE_ONLY` to `1` in hardhat's environment. For more details see [the documentation](https://hardhat.org/guides/typescript.html#performance-optimizations).
