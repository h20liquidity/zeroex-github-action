#!/usr/bin/env node

require("dotenv").config();
const fs = require("fs");
const Ajv = require("ajv");
const path = require("path");
const ethers = require("ethers");
const { clear } = require("./src");
const CONFIG = require("./config.json");
const { Command } = require("commander");
const { version } = require("./package.json");
const ordersSchema = require("./schema/orders.schema.json");


const DEFAULT_OPTIONS = {
    key: process?.env?.WALLET_KEY,
    rpc: process?.env?.RPC_URL,
    apiKey: process?.env?.API_KEY,
    slippage: "0.001",    // 0.1%
    orders: "./orders.json"
};

const getOptions = async argv => {
    const commandOptions = new Command("node arb-bot")
        .option("-k, --key <private-key>", "Private key of wallet that performs the transactions. Will override the 'WALLET_KEY' in '.env' file")
        .option("-r, --rpc <url>", "RPC URL that will be provider for interacting with evm. Will override the 'RPC_URL' in '.env' file")
        .option("-o, --orders <path>", "Path to the file that holds the orders to operate on. If provided will ignore './orders.json' file.")
        .option("-s, --slippage <number>", "Sets the slippage percentage for the clearing orders, default is 0.001 which is 0.1%")
        .option("-a, --api-key <key>", "0x API key, can be set in env variables, Will override the API_KEY env variable if a value passed in CLI")
        .option("--orderbook-address <address>", "Address of the deployed orderbook contract. Will override 'orderbookAddress' field in './config.json' file")
        .option("--arb-address <address>", "Address of the deployed arb contract. Will override 'arbAddress' field in './config.json' file")
        .option("--interpreter-abi <path>", "Path to the IInterpreter contract ABI, should be absolute path, default is the ABI in the './src/abis' folder")
        .option("--arb-abi <path>", "Path to the Arb (ZeroExOrderBookFlashBorrower) contract ABI, should be absolute path, default is the ABI in the './src/abis' folder")
        .option("--orderbook-abi <path>", "Path to the Orderbook contract ABI, should be absolute path, default is the ABI in the './src/abis' folder")
        .version(version)
        .parse(argv)
        .opts();

    commandOptions.key = commandOptions.key || DEFAULT_OPTIONS.key;
    commandOptions.rpc = commandOptions.rpc || DEFAULT_OPTIONS.rpc;
    commandOptions.apiKey = commandOptions.apiKey || DEFAULT_OPTIONS.apiKey;
    commandOptions.slippage = commandOptions.slippage || DEFAULT_OPTIONS.slippage;
    commandOptions.orders = commandOptions.orders || DEFAULT_OPTIONS.orders;

    return commandOptions;
};

const main = async argv => {
    const AddressPattern = /^0x[a-fA-F0-9]{40}$/;
    const options = await getOptions(argv);

    if (!options.key) throw "undefined wallet private key";
    if (!/^(0x)?[a-fA-F0-9]{64}$/.test(options.key)) throw "invalid wallet private key";
    if (!options.rpc) throw "undefined RPC URL";
    if (!/^\d+(\.\d+)?$/.test(options.slippage)) throw "invalid slippage value";

    const provider = new ethers.providers.JsonRpcProvider(options.rpc);
    const signer = new ethers.Wallet(options.key, provider);
    const chainId = await signer.getChainId();
    const config = CONFIG.find(v => v.chainId === chainId);

    if (!config) throw `Cannot find configuration for the network with chain id: ${chainId}`;
    else {
        if (options.orderbookAddress && AddressPattern.test(options.orderbookAddress)) {
            config.orderbookAddress = options.orderbookAddress;
        }
        if (options.arbAddress && AddressPattern.test(options.arbAddress)) {
            config.arbAddress = options.arbAddress;
        }
    }

    if (!config.orderbookAddress) throw "undfined orderbook contract address";
    if (!AddressPattern.test(config.orderbookAddress)) throw "invalid orderbook contract address";

    if (!config.arbAddress) throw "undefined arb contract address";
    if (!AddressPattern.test(config.arbAddress)) throw "invalid arb contract address";

    const orders = JSON.parse(fs.readFileSync(path.resolve(__dirname, options.orders)).toString());
    const ajv = new Ajv();
    if (!orders || !Array.isArray(orders) || !ajv.compile(ordersSchema)(orders)) throw "Invalid specified orders";

    if (options.interpreterAbi) config.interpreterAbi = options.interpreterAbi;
    if (options.arbAbi) config.arbAbi = options.arbAbi;
    if (options.orderbookAbi) config.orderbookAbi = options.orderbookAbi;

    await clear(
        signer,
        config,
        orders,
        options.slippage
    );
};

main(
    process.argv
).then(
    () => console.log("Rain orderbook arbitrage clearing process finished successfully!")
).catch(
    v => console.log(v)
);