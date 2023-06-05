# 0x Take Order Bot
A bot running on NodeJs environment for targeting sepcific Rain orderbook orders to clear against 0x liquidity (0x orders), this can also run on a github action (with cron job).<br>
The operating network will be derived from `RPC_URL` that is specified in `.env` file or passed as argument with `--rpc` flag.
<bt>


# Easy Setup for Github Actions
For an easy setup to get this working in github actions:<br>
1 - Fork this repository and add your wallet private key as `WALLET_KEY` and rpc url as `RPC_URL` to your repository secrets. 
For details on how to add secrets to your repository please read [here](https://docs.github.com/en/actions/security-guides/encrypted-secrets#creating-encrypted-secrets-for-a-repository).
For making a rpc url from your alchemy key for Polygon network (in case you only have the alchemy key), just replace the `YOUR-ALCHEMY-KEY` part with your key in here: https://polygon-mainnet.g.alchemy.com/v2/YOUR-ALCHEMY-KEY.
Alternatively you can get the HTTPS or Websocket rpc url of your prefered provider by following the instructions of your provider and add it as your `RPC_URL` secret.<br>
2 - Add your orders into the `./orders.json` file, orders must be of valid Order struct, and `validInputs` and `validOutputs` should only have one item each. See `./example.orders.json` for an example of an order struct.
You can also copy/paste the `./scripts/DeployStrategy/orderDetails.json` content output from [neighbourhoods](https://github.com/h20liquidity/neighbourhoods) repository to the `./orders.json` file.<br>
3 - Add `Orderbook` and `0xOrderBookFlashBorrower` contract addresses to the `./.github/workflows/take-orders.yaml` file's last line after their respective flags, for more info about CLI flags and options read below.<br>
4 - Enable and uncomment the `Take Orders` workflow in the actions tab of your forked repository, this is needed because scheduled workflows will be disabled by default for forked repositories. Please be aware that the first run may take a bit more time, so be patient after enabling this workflow.<br>
5 - Optionally you can edit the schedule in `./.github/workflows/take-orders.yaml` by modifying the cron syntax, by default it is set to run every 5 minutes.
Please be aware that github scheduled workflows are not guaranteed to run at exact schedule because of github resource availability.<br>
6 - Optionally you can specify more options with CLI flags in the workflow, for more info about the CLI flags read below.<br>
7 - Once the workflow has started, you can go to the repository actions tab, see the `Take Orders` workflows runs list, click it, next click `take-orders` box and then from the list of completed jobs you can view the "Take Orders" job by expanding it and see the log details (cleared amount, price, transaction hash, ...)<br>

### Notice
The process can be run in a github actions as a workflow, the configuration for it is available in `./.github/workflows/take-orders.yaml`. The schedule for triggering can be modified in the mentioned file with cron syntax (or any other form of triggering event for a github action of your choice).
Please be aware that github only allows scheduled workflows to run at most every 5 minutes and it is neither guaranteed to run at specified schedule due to github resources being reserved, so sometimes it can take 10 or 15 or even more minutes longer than specified schedule time to run, therefore, it's not recommended to use GitHub Actions scheduled workflows for production tasks that require execution guarantee, please read [here](https://upptime.js.org/blog/2021/01/22/github-actions-schedule-not-working/) for more info.<br>
You also need to enable this workflow in case you have forked this repository.
<br>


# Advanced Setup
The following will give you the full configuration capabilities:

## Adding Orders
Make a json file (optionaly named `orders.json`) and specify the desired order(s) in it. If the file is in any directory other than root directory of this repo then you need to specify its path when executing the `node arb-bot` using `-o` flag.
`validInputs` and `validOutputs` should only have one item each, if not, only the first item of each going to be used 
by the bot and rest of them will be ignored and please be aware that orders must be of valid `Order` struct.<br>
Example of an Order struct (see `./example.orders.json`):
```json
{
  "owner": "<owner address>",
  "handleIO": "<true/false>",
  "evaluable": {
    "interpreter": "<interpreter address>",
    "store": "<store address>",
    "expression": "<order expression address>"
  },
  "validInputs": [{
    "token": "<input token address>",
    "decimals": "<token decimals, number>",
    "vaultId": "<vault id>"
  }],
  "validOutputs": [{
    "token": "<output token address>",
    "decimals": "<token decimals>",
    "vaultId": "<vault id>"
  }]
}
```
If you use vscode, schmeas in `./schema` folder will help you with tips, else you can set your text editor to use the `./schema/orders.schema.json` schema for your orders file.
Optionally you can set up your orders details in another file and pass the file path as an argument to cli with `--orders` flag.
<br>

## Configurations
Configurations can be set in the files and/or as cli arguments when executing the `node arb-bot` command. If any cli argument is passed on, it will override their counterparts specified in the files.

### CLI
Start by cloning the repo and then install the dependencies:
```bash
npm install
```
or
```bash
yarn install
```
If you have Nix installed on your machine you can tun the app on nix environment:
```bash
nix-shell
```
<br>

For starting the app:
```bash
node arb-bot -k 12ab... -r https://... --orderbook-address 0x1a2b... --arb-address 0xab12... [other optional arguments]
```
The app requires these 4 arguments:
- `-k` or `--key` A wallet private with eth balance to cover transaction costs, this wallet also receives the profits from submitting the transactions. A wallet private key is 64 length hex string. This can be set as environment variables too, see below.
- `-r` or `--rpc` An RPC URL, such as from Alchemy or Infura required for interacting with the working network. This can be set as environment variables too, see below.
- `--orderbook-address` The Rain Orderbook contract address deployed on the working network.
- `--arb-address` The Arb (ZeroExOrderBookFlashBorrower) contract address deployed on the working network.

Other optional arguments are:
- `-o` or `--orders` Path to the file that holds the orders to operate on. If provided will ignore './orders.json' file.
- `-a` or `--api-key` The 0x API key to use for quoting 0x with. Can also be set in env variables as `API_KEY`, see below.
- `-s` or `--slippage` The slippage that can be set for the trades, the default is 0.001 which is 0.1%
- `--interpreter-abi` The path to IInterpreter ABI json file used for instantiating ethers contract instances, should be absolute path, default is the `./src/abis/IInerpreterV1.json`.
- `--arb-abi` The path to Arb (ZeroExOrderBookFlashBorrower) ABI json file used for instantiating ethers contract instances, should be absolute path, default is the `./src/abis/ZeroExOrderBookFlashBorrower.json`.
- `--orderbook-abi` The path to Orderbook ABI json file used for instantiating ethers contract instances, should be absolute path, default is the `./src/abis/OrderBook.json`.
- `-h` or `--help` To show the CLI command's help
- `-v` or `--version` To show the app's version
<br>

## CLI Help

    Usage: node arb-bot [options]

    Options:
      -k, --key <private-key>        Private key of wallet that performs the transactions. Will override the 'WALLET_KEY' in '.env' file
      -r, --rpc <url>                RPC URL that will be provider for interacting with evm. Will override the 'RPC_URL' in '.env' file
      -o, --orders <path>            Path to the file that holds the orders to operate on. If provided will ignore './orders.json' file.
      -s, --slippage <number>        Sets the slippage percentage for the clearing orders, default is 0.001 which is 0.1%
      -a, --api-key <key>            0x API key, can be set in env variables, Will override the API_KEY env variable if a value passed in CLI
      --orderbook-address <address>  Address of the deployed orderbook contract. Will override 'orderbookAddress' field in './config.json' file
      --arb-address <address>        Address of the deployed arb contract. Will override 'arbAddress' field in './config.json' file
      --interpreter-abi <path>       Path to the IInterpreter contract ABI, should be absolute path, default is the ABI in the './src/abis' folder
      --arb-abi <path>               Path to the Arb (ZeroExOrderBookFlashBorrower) contract ABI, should be absolute path, default is the ABI in the './src/abis' folder
      --orderbook-abi <path>         Path to the Orderbook contract ABI, should be absolute path, default is the ABI in the './src/abis' folder
      -V, --version                  output the version number
      -h, --help                     display help for command
<br>

### Configuration Through Files
Create a `.env` file and populate it with following (see `./example.env` for reference):
```bash
WALLET_KEY="<private-key-of-bot-account>"

RPC_URL="<rpc-url>"

# 0x API key
API_KEY="<0x-api-key>"
```
`WALLET_KEY` will be used as the wallet that submits the transactions and `RPC_URL` will be the provider required for submitting transactions.
All these values can alternatively be provided through cli with thier corresponding flag, please see CLI section for more info.
If they are specified in `.env` file and passed in CLI, the CLI values will be used as primary.
<br>

Alternatively the operating `Orderbook`, `ZeroExOrderBookFlashBorrower` contracts addresses can be specified in `./config.json` in their respective fields of their specific networks so passing them as CLI can be ignored, however, if these both are provided the CLI will be used.<br>
Example of a configuration:
```json
[
  {
    "network": "polygon",
    "chainId": 137,
    "apiUrl": "https://polygon.api.0x.org/",
    "orderBookAddress": "<OrderBook contract address>",
    "arbAddress": "<ZeroExOrderBookFlashBorrower contract address>",
    "proxyAddress": "0xdef1c0ded9bec7f1a1670819833240f027b25eff",
    "nativeToken": {
      "symbol": "MATIC",
      "address": "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      "decimals": 18
    }
  },
  {
    "network": "mumbai",
    "chainId": "0x80001",
    "apiUrl": "https://mumbai.api.0x.org/",
    "orderBookAddress": "<OrderBook contract address>",
    "arbAddress": "<ZeroExOrderBookFlashBorrower contract address>",
    "proxyAddress": "0xf471d32cb40837bf24529fcf17418fc1a4807626",
    "nativeToken": {
      "symbol": "MATIC",
      "address": "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      "decimals": 18
    }
  }
]
```
If you use vscode, schmeas in `./schema` folder will help you with tips, else you can set your text editor to use the `./schema/config.schema.json` schema for the config file.
<br>

### API
The app can be executed through API:
```javascript
// to import
const arb = require("@rainprotocol/arb-bot");
const fs = require("fs");
const path = require("path");
const ethers = require("ethers");


// to instantiate a valid ethers wallet instance from your wallet private key and rpc url:
// instantiate the ethers provider with rpc url
const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

// alternatively the provider can be instantiated with specific ethers API for rpc providers such as Alchemy
// this is prefered if you know the provider organization
const provider = new ethers.providers.AlchemyProvider(rpcUrl)

// instantiate the ethers wallet instance with private key
const wallet = new ethers.Wallet(walletPrivateKey, provider)


// to run the app:
// to get the order details from a a file
const orders = JSON.parse(fs.readFileSync(path.resolve(__dirname, options.orders)).toString());

// to get the configuration object
const config = await arb.getConfig(wallet, ...[ orderbookAddress, arbAddress, arbAbiPath, interpreterAbiPath, orderbookAbiPath ]);

// to run the clearing process and get the report object which holds the report of cleared orders
const reports = await arb.clear(wallet, config, orders, ...[ slippage ])
```
<br>

## Contract ABIs
By default the bot will get required contract ABIs (`OrderBook`, `ZeroExOrderBookFlashBorrower` and `IInterpreterV1`) from `./abis` folder, so if the contracts get updated the ABI files need to be updated as well.