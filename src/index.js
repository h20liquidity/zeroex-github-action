const fs = require("fs");
const path = require("path");
const axios = require("axios");
const ethers = require("ethers");
const CONFIG = require("../config.json");
let { abi: orderbookAbi } = require("../abis/OrderBook.json");
const { interpreterEval, ETHERSCAN_TX_PAGE } = require("./utils");
const { abi: erc20Abi } = require("../abis/ERC20Upgradeable.json");
let { abi: interpreterAbi } = require("../abis/IInterpreterV1.json");
let { abi: arbAbi } = require("../abis/ZeroExOrderBookFlashBorrower.json");


/**
 * Estimates the profit for a single bundled orders struct
 * @param {any} txQuote - The quote from 0x
 * @param {ethers.BigNumber} ratio - The ratio of the order
 * @param {ethers.BigNumber} quoteAmount - The quote amount
 * @param {ethers.BigNumber} gas - The estimated gas cost
 * @param {string} partialGasCoverage - Partially cover gas cost, default is 1 meaning full gas coverage in profit estimation
 * @returns The estimated profit
 */
const estimateProfit = (txQuote, ratio, quoteAmount, gas, partialGasCoverage = "1") => {
    const price = ethers.utils.parseUnits(txQuote.price);
    const gasCost = ethers.utils.parseEther(txQuote.buyTokenToEthRate)
        .mul(gas)
        .div(ethers.utils.parseUnits("1"))
        .mul(ethers.utils.parseUnits(partialGasCoverage))
        .div(ethers.utils.parseUnits("1"));
    const income = price
        .sub(ratio)
        .mul(quoteAmount)
        .div(ethers.utils.parseUnits("1"));
    return income.sub(gasCost);
};

/**
 * Extracts the income (received token value) from transaction receipt
 * @param {ethers.Wallet} signer - The ethers wallet instance of the bot
 * @param {any} receipt - The transaction receipt
 * @returns The income value or undefined if cannot find any valid value
 */
const getIncome = (signer, receipt) => {
    const erc20Interface = new ethers.utils.Interface(erc20Abi);
    return receipt.events.filter(
        v => v.topics[2] && ethers.BigNumber.from(v.topics[2]).eq(signer.address)
    ).map(v => {
        try{
            return erc20Interface.decodeEventLog("Transfer", v.data, v.topics);
        }
        catch {
            return undefined;
        }
    })[0]?.value;
};

/**
 * Calculates the actual clear price from transactioin event
 * @param {any} receipt - The transaction receipt
 * @param {string} orderbook - The Orderbook contract address
 * @param {string} arb - The Arb contract address
 * @param {string} amount - The clear amount
 * @param {number} sellDecimals - The sell token decimals
 * @param {number} buyDecimals - The buy token decimals
 * @returns The actual clear price or undefined if necessary info not found in transaction events
 */
const getActualPrice = (receipt, orderbook, arb, amount, sellDecimals, buyDecimals) => {
    const erc20Interface = new ethers.utils.Interface(erc20Abi);
    const eventObj = receipt.events.map(v => {
        try{
            return erc20Interface.decodeEventLog("Transfer", v.data, v.topics);
        }
        catch {
            return undefined;
        }
    }).filter(
        v =>
            v &&
            !ethers.BigNumber.from(v.from).eq(orderbook) &&
            ethers.BigNumber.from(v.to).eq(arb)
    );
    if (eventObj[0] && eventObj[0]?.value) return ethers.utils.formatUnits(
        eventObj[0].value
            .mul("1" + "0".repeat(36 - sellDecimals))
            .div(amount)
            .div("1" + "0".repeat(18 - sellDecimals)),
        buyDecimals
    );
    else return undefined;
};

/**
 * Get the configuration info of a network required for the bot
 * @param {ethers.Wallet} wallet - The ethers wallet with private key instance
 * @param {string} orderbookAddress - (optional) The Rain Orderbook contract address deployed on the network
 * @param {string} arbAddress - (optional) The Rain Arb contract address deployed on the network
 * @param {string} arbAbiPath - (optional) The path to Arb contract ABI, default is ABI in './src/abis' folder
 * @param {string} interpreterAbiPath - (optional) The path to IInterpreter contract ABI, default is ABI in './src/abis' folder
 * @param {string} orderbookAbiPath - (optional) The path to Orderbook contract ABI, default is ABI in './src/abis' folder
 * @returns The configuration object
 */
exports.getConfig = async(
    wallet,
    orderbookAddress = "",
    arbAddress = "",
    arbAbiPath = "",
    interpreterAbiPath = "",
    orderbookAbiPath = "",
) => {
    const AddressPattern = /^0x[a-fA-F0-9]{40}$/;
    const chainId = (await wallet.getChainId());
    const config = CONFIG.find(v => v.chainId === chainId);

    if (!config) throw `Cannot find configuration for the network with chain id: ${chainId}`;
    else {
        if (orderbookAddress && AddressPattern.test(orderbookAddress)) {
            config.orderbookAddress = orderbookAddress;
        }
        if (arbAddress && AddressPattern.test(arbAddress)) {
            config.arbAddress = arbAddress;
        }
    }
    if (!config.orderbookAddress) throw "undfined orderbook contract address";
    if (!AddressPattern.test(config.orderbookAddress)) throw "invalid orderbook contract address";

    if (!config.arbAddress) throw "undefined arb contract address";
    if (!AddressPattern.test(config.arbAddress)) throw "invalid arb contract address";

    if (interpreterAbiPath) config.interpreterAbi = interpreterAbiPath;
    if (arbAbiPath) config.arbAbi = arbAbiPath;
    if (orderbookAbiPath) config.orderbookAbi = orderbookAbiPath;
    return config;
};

/**
 * Main function that tries clearing the orders
 *
 * @param {ethers.Signer} signer - The ethersjs signer constructed from provided private keys and rpc url provider
 * @param {object} config - The configuration object
 * @param {object[]} orders - The orders as array of objects
 * @param {string} slippage - (optional) The slippage for clearing orders, default is 0.01 i.e. 1 percent
 * @returns The report of details of cleared orders
 */
exports.clear = async(signer, config, orders, slippage = "0.01") => {
    const HEADERS = { headers: { "accept-encoding": "null" } };
    const api = config.apiUrl;
    const chainId = config.chainId;
    const arbAddress = config.arbAddress;
    const orderbookAddress = config.orderbookAddress;
    const intAbiPath = config.interpreterAbi;
    const arbAbiPath = config.arbAbi;
    const orderbookAbiPath = config.orderbookAbi;

    // set the api key in headers
    if (config.apiKey) HEADERS.headers["0x-api-key"] = config.apiKey;

    // get the abis if path is provided for them
    if (intAbiPath) interpreterAbi = (JSON.parse(
        fs.readFileSync(path.resolve(__dirname, intAbiPath)).toString())
    )?.abi;
    if (arbAbiPath) arbAbi = JSON.parse(
        fs.readFileSync(path.resolve(__dirname, arbAbiPath)).toString()
    )?.abi;
    if (orderbookAbiPath) orderbookAbi = JSON.parse(
        fs.readFileSync(path.resolve(__dirname, orderbookAbiPath)).toString()
    )?.abi;

    // instantiating arb contract
    const arb = new ethers.Contract(arbAddress, arbAbi, signer);

    // instantiating orderbook contract
    const orderbook = new ethers.Contract(orderbookAddress, orderbookAbi, signer);

    // orderbook as signer used for eval
    const obAsSigner = new ethers.VoidSigner(
        orderbookAddress,
        signer.provider
    );

    console.log(
        "------------------------- Starting Clearing Process -------------------------",
        "\n"
    );
    console.log(Date());
    console.log("Arb Contract Address: " , arbAddress);
    console.log("OrderBook Contract Address: " , orderbookAddress, "\n");

    if (!orders.length) console.log("No orders found, exiting...", "\n");

    const report = [];
    for (let i = 0; i < orders.length; i++) {

        console.log(
            `------------------------- Clearing Order NO ${i} -------------------------`,
            "\n"
        );

        const inputToken = new ethers.Contract(orders[i].validInputs[0].token, erc20Abi, signer);
        const outputToken = new ethers.Contract(orders[i].validOutputs[0].token, erc20Abi, signer);
        const inputSymbol = await inputToken.symbol();
        const outputSymbol = await outputToken.symbol();

        console.log(
            `------------------------- Token Pair ${inputSymbol + "/" + outputSymbol} -------------------------`,
            "\n"
        );

        const outputBalance = await orderbook.vaultBalance(
            orders[i].owner, 
            orders[i].validOutputs[0].token, 
            orders[i].validOutputs[0].vaultId
        );
        const fpOutputBalance = outputBalance.mul(
            "1" + "0".repeat(18 - orders[i].validOutputs[0].decimals)
        );

        console.log("Order's output vault balance:",  outputBalance.toString(), outputSymbol, "\n");

        // only try to clear if vault balance is not zero
        if (outputBalance.isZero()) console.log("Order's output balance is empty, skipping...", "\n");
        else {
            // getting input vault balance for eval context
            const inputBalance = await orderbook.vaultBalance(
                orders[i].owner, 
                orders[i].validInputs[0].token, 
                orders[i].validInputs[0].vaultId
            );

            try {
                const { maxOutput, ratio } = await interpreterEval(
                    new ethers.Contract(
                        orders[i].evaluable.interpreter,
                        interpreterAbi,
                        obAsSigner
                    ),
                    arbAddress,
                    orderbookAddress,
                    orders[i],
                    0,
                    0,
                    inputBalance.toString(),
                    outputBalance.toString()
                );

                // take minimum of maxOutput and output vault balance for 0x qouting amount
                const fpQuoteAmount = fpOutputBalance.lte(maxOutput)
                    ? fpOutputBalance
                    : maxOutput;

                const quoteAmount = fpQuoteAmount.div(
                    "1" + "0".repeat(18 - orders[i].validOutputs[0].decimals)
                );

                console.log(`>>> Quote Amount: ${ethers.utils.formatEther(fpQuoteAmount)}`, outputSymbol, "\n");

                // only try to clear if quote amount is not zero
                if (fpQuoteAmount.isZero()) console.log("Quote amount is zero, skipping...", "\n");
                else {
                    console.log(`Buy Token Address (${inputSymbol}): ${orders[i].validInputs[0].token}`);
                    console.log(`Sell Token Address (${outputSymbol}): ${orders[i].validOutputs[0].token}`, "\n");

                    console.log(">>> Getting quote for this order...", "\n");

                    try {
                        const response = await axios.get(
                            `${
                                api
                            }swap/v1/quote?buyToken=${
                                orders[i].validInputs[0].token.toLowerCase()
                            }&sellToken=${
                                orders[i].validOutputs[0].token.toLowerCase()
                            }&sellAmount=${
                                quoteAmount.toString()
                            }&slippagePercentage=${
                                slippage
                            }`,
                            HEADERS
                        );
                        const txQuote = response?.data;
                        if (!txQuote) console.log("Failed to get quote from 0x", "\n");
                        else {
                            console.log(`Current market price of this token pair: ${txQuote.price}`);
                            console.log(`Current ratio of the order: ${ethers.utils.formatEther(ratio)}`);
                            if (ethers.utils.parseUnits(txQuote.price).lt(ratio)) console.log(
                                "Order has higher ratio than current market price, skipping...", 
                                "\n"
                            );
                            else {
                                console.log(">>> Found a match, submitting an order to clear...\n");

                                // construct the take order config
                                const takeOrder = {
                                    order: {
                                        owner: orders[i].owner,
                                        handleIO: orders[i].handleIO,
                                        evaluable: orders[i].evaluable,
                                        validInputs: orders[i].validInputs,
                                        validOutputs: orders[i].validOutputs
                                    },
                                    inputIOIndex: 0,
                                    outputIOIndex: 0,
                                    signedContext: []
                                };
                                const takeOrdersConfigStruct = {
                                    output: orders[i].validInputs[0].token,
                                    input: orders[i].validOutputs[0].token,
                                    // max and min input should be exactly the same as quoted sell amount
                                    // this makes sure the cleared order amount will exactly match the 0x quote
                                    minimumInput: quoteAmount,
                                    maximumInput: quoteAmount,
                                    maximumIORatio:  ethers.constants.MaxUint256,
                                    orders: [ takeOrder ],
                                };
                                // submit the transaction
                                try {
                                    console.log(">>> Estimating the profit for this token pair...", "\n");
                                    const gasLimit = await arb.estimateGas.arb(
                                        takeOrdersConfigStruct,
                                        // set to zero because only profitable transactions are submitted
                                        0,
                                        txQuote.allowanceTarget,
                                        txQuote.data,
                                        { gasPrice: txQuote.gasPrice }
                                    );
                                    const maxEstimatedProfit = estimateProfit(
                                        txQuote,
                                        ratio,
                                        fpQuoteAmount,
                                        gasLimit.mul(txQuote.gasPrice),
                                        "0.1"
                                    );
                                    console.log(`Max Estimated Profit: ${
                                        ethers.utils.formatEther(maxEstimatedProfit)
                                    } ${inputSymbol}`, "\n");

                                    // if (maxEstimatedProfit.isNegative()) console.log(
                                    //     ">>> Skipping because estimated negative profit for this order", 
                                    //     "\n"
                                    // );
                                    // else 
                                    // {
                                    console.log(">>> Trying to submit the transaction for this order...", "\n");
                                    const tx = await arb.arb(
                                        takeOrdersConfigStruct,
                                        // set to zero because only profitable transactions are submitted
                                        0,
                                        txQuote.allowanceTarget,
                                        txQuote.data,
                                        { gasPrice: txQuote.gasPrice, gasLimit }
                                    );
                                    console.log(ETHERSCAN_TX_PAGE[chainId] + tx.hash, "\n");
                                    console.log(
                                        ">>> Transaction submitted successfully to the network, waiting for transaction to mine...",
                                        "\n"
                                    );

                                    try {
                                        const receipt = await tx.wait();
                                        const income = getIncome(signer, receipt);
                                        const gasCost = ethers.BigNumber.from(
                                            txQuote.gasPrice
                                        ).mul(receipt.gasUsed);
                                        const clearActualPrice = getActualPrice(
                                            receipt,
                                            orderbookAddress,
                                            arbAddress,
                                            fpQuoteAmount,
                                            orders[i].validOutputs[0].decimals,
                                            orders[i].validInputs[0].decimals
                                        );
                                        const netProfit = income
                                            ? income.sub(
                                                ethers.utils.parseUnits(
                                                    txQuote.buyTokenToEthRate
                                                ).mul(
                                                    gasCost
                                                ).div(
                                                    "1" + "0".repeat(
                                                        36 - orders[i].validInputs[0].decimals
                                                    )
                                                )
                                            )
                                            : undefined;

                                        console.log(`Clear Quote Price: ${txQuote.price}`);
                                        console.log(`Clear Actual Price: ${clearActualPrice}`);
                                        console.log(`Clear Amount: ${
                                            ethers.utils.formatUnits(
                                                quoteAmount,
                                                orders[i].validOutputs[0].decimals
                                            )
                                        } ${outputSymbol}`);
                                        console.log(`Consumed Gas: ${ethers.utils.formatEther(gasCost)} ETH`, "\n");
                                        if (income) {
                                            console.log(`Raw Income: ${ethers.utils.formatUnits(
                                                income,
                                                orders[i].validInputs[0].decimals
                                            )} ${inputSymbol}`);
                                            console.log(`Net Profit: ${ethers.utils.formatUnits(
                                                netProfit,
                                                orders[i].validInputs[0].decimals
                                            )} ${inputSymbol}`, "\n");
                                        }

                                        report.push({
                                            transactionHash: receipt.transactionHash,
                                            tokenPair: inputSymbol + "/" + outputSymbol,
                                            buyToken: orders[i].validInputs[0].token,
                                            buyTokenDecimals: orders[i].validInputs[0].decimals,
                                            sellToken: orders[i].validOutputs[0].token,
                                            sellTokenDecimals: 
                                                orders[i].validOutputs[0].decimals,
                                            clearedAmount: quoteAmount.toString(),
                                            clearPrice: txQuote.price,
                                            clearGuaranteedPrice: txQuote.guaranteedPrice,
                                            clearActualPrice,
                                            maxEstimatedProfit,
                                            gasUsed: receipt.gasUsed,
                                            gasCost,
                                            income,
                                            netProfit
                                        });
                                    }
                                    catch (error) {
                                        console.log(">>> Transaction execution failed due to:");
                                        console.log(error, "\n");
                                    }
                                    // }
                                }
                                catch (error) {
                                    console.log(">>> Transaction failed due to:");
                                    console.log(error, "\n");
                                }
                            }
                        }
                    }
                    catch (error) {
                        console.log(">>> Failed to get quote from 0x due to:", "\n");
                        console.log(error.message);
                        console.log("data:");
                        console.log(JSON.stringify(error.response.data, null, 2), "\n");
                    }
                }
            }
            catch (error) {
                console.log(">>> Failed to evaluate the order's expression due to:", "\n");
                console.log(error);
            }
        }
        console.log("---------------------------------------------------------------------------", "\n");
    }
    return report;
};