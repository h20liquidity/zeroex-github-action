/**
 * Configurations of the networks that the bot will operate on.
 */
module.exports = [
    {
        network: 'polygon',
        chainId: 137,
        apiUrl: 'https://polygon.api.0x.org/',
        defaultRpc: '',
        orderBookAddress : "0x42cc063a0730a99ff2fc25218c606eb4969ca2eb",
        arbAddress : "0x867fdf225b666a2f16bb4c08404c597c909399a5",
        proxyAddress: '0xdef1c0ded9bec7f1a1670819833240f027b25eff',
        nativeToken: {
            symbol: 'MATIC',
            address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
            decimals: 18
        },
        // trackedTokens: [
        //     {
        //         symbol: 'USDT',
        //         address: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
        //         decimals: 6
        //     } ,
        //     {
        //         symbol: 'NHT',
        //         address: '0x84342e932797FC62814189f01F0Fb05F52519708',
        //         decimals: 18
        //     }
        // ]
    },
    {
        network: 'mumbai',
        chainId: 0x80001,
        apiUrl: 'https://mumbai.api.0x.org/',
        defaultRpc: '',
        arbAddress: '0xd14ead3f35f1c034f9fe43316bf36edca2cb2b90',
        orderBookAddress: '0xe646c1bf3cb1223234ebd934d0257fc21ac141cf',
        proxyAddress: '0xf471d32cb40837bf24529fcf17418fc1a4807626',
        nativeToken: {
            symbol: 'MATIC',
            address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
            decimals: 18
        },
        // trackedTokens: [
        //     {
        //         symbol: 'USDT',
        //         address: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
        //         decimals: 6
        //     } ,
        //     {
        //         symbol: 'NHT',
        //         address: '0x84342e932797FC62814189f01F0Fb05F52519708',
        //         decimals: 18
        //     }
        // ]
    }
];

// interprter:"0x8ecd48e70954dec0f45e4551f039a0d24038c536"
// store:"0x13cdd62f032125fea331cf8b79eade8830cd5dab"
// expression:"0x68181074a3929f51be86078e584e1ddc2cb3007c"
// orderbook : 0x42cc063a0730a99ff2fc25218c606eb4969ca2eb 
// clonefactory :  "0xf73d944e5d2c5a61d5821df1b275e0eaf016ff39" 
// zeroexorderbookinstance : "0x867fdf225b666a2f16bb4c08404c597c909399a5"