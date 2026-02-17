const axios = require('axios');

class DelegatorFilter {
    constructor() {
        this.metasleuthApiKey = process.env.METASLEUTH_API_KEY || 'your_metasleuth_api_key';
        this.metasleuthBaseUrl = 'https://api.metasleuth.io';
        
        // Extended list of known exchange and DeFi addresses on Ethereum/Polygon
        this.knownExchangeAddresses = new Set([
            // Major exchanges - Ethereum addresses
            '0x5e3346444010135322268a0ca24b70e5b1d0d52a', // Binance
            '0x6cc5f688a315f3dc28a7781717a9a798a59fda7b', // OKX
            '0x46340b20830761efd32832a74d7169b29feb9758', // Crypto.com
            '0x28c6c06298d514db089934071355e5743bf21d60', // Binance 2
            '0x21a31ee1afc51d94c2efccaa2092ad1028285549', // Binance 3
            '0xdfd5293d8e347dfe59e90efd55b2956a1343963d', // Binance 4
            '0x56eddb7aa87536c09ccc2793473599fd21a8b17f', // Binance 5
            '0x9696f59e4d72e237be84ffd425dcad154bf96976', // Binance 6
            '0x4e9ce36e442e55ecd9025b9a6e0d88485d628a67', // Binance 7
            '0xbe0eb53f46cd790cd13851d5eff43d12404d33e8', // Binance 8
            '0xf977814e90da44bfa03b6295a0616a897441acec', // Binance 9
            '0x001866ae5b3de6caa5a51543fd9fb64f524f5478', // Binance 10
            '0x85b931a32a0725be14285b66f1a22178c672d69b', // Binance 11
            '0x708396f17127c42383e3b9014072679b2f60b82f', // Binance 12
            '0xe0f0cfde7ee664943906f17f7f14342e76a5cec7', // Binance 13
            '0x8f22f2063d253846b53609231ed80fa571bc0c8f', // Binance 14
            '0x28c6c06298d514db089934071355e5743bf21d60', // Binance Hot Wallet
            '0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be', // Binance Hot Wallet 2
            '0xd551234ae421e3bcba99a0da6d736074f22192ff', // Binance Hot Wallet 3
            '0x564286362092d8e7936f0549571a803b203aaced', // Binance Hot Wallet 4
            '0x0681d8db095565fe8a346fa0277bffde9c0edbbf', // Binance Hot Wallet 5
            '0x4e68ccd3e89f51c3074ca5072bbac773960dfa36', // Binance Hot Wallet 6
            '0x7ee9f7b851fb9c8c2f8bfd7b49cc74b68f48f3a6', // KuCoin
            '0x2b5634c42055806a59e9107ed44d43c426e58258', // KuCoin 2
            '0x689c56aef474df92d44a1b70850f808488f9769c', // KuCoin 3
            '0xa1d8d972560c2f8144af871db508f0b0b10a3fbf', // KuCoin 4
            '0x1692e170361cefd1eb7240ec13d048fd9af6d667', // KuCoin 5
            '0xd6216fc19db775df9774a6e33526131da7d19a2c', // KuCoin 6
            '0xcdd7c759e0b140f7e6508fc00da24733cb43ce2b', // Gate.io
            '0x1c4b70a3968436b9a0a9cf5205c787eb81bb558c', // Gate.io 2
            '0x503828976d22510aad0201ac7ec88293211d23da', // Gate.io 3
            '0x61edcdf5bb737adffe5043706e7332c5807a70af', // Huobi
            '0xab5c66752a9e8167967685f1450532fb96d5d24f', // Huobi 2
            '0x5861b8446a2f6e19a067874c133f04c578928727', // Huobi 3
            '0x926fc576b7facf6ae2d08ee2d4734c134a99f584', // Huobi 4
            '0x18916e1a2933cb349145a667390d3a915be5fad7', // Huobi 5
            '0x6748f50f686bfbca6fe8ad62b22228b87f31ff2b', // Huobi 6
            '0x90e9a4a7bf87b8b9ce5e0994db2a77e65ff6e780', // Huobi 7
            '0xeee28d484628d41a82d01e21d12e2e78d69920da', // Bitfinex
            '0xcafb10ee663f465f9d10588ac44ed20ed608c11e', // Bitfinex 2
            '0x876eabf441b2ee5b5b0554fd502a8e0600950cfa', // Bitfinex 3
            '0xdac17f958d2ee523a2206206994597c13d831ec7', // Bitfinex 4 (USDT)
            '0x4fabb145d64652a948d72533023f6e7a623c7c53', // Bitfinex 5 (BUSD)
            '0x1151314c646ce4e0efd76d1af4760ae66a9fe30f', // Bitfinex 6
            '0x7727e5113d1d161373623e5f49fd568b4f543a9e', // Bitfinex 7
            '0xc61b9bb3a7a0767e3179713f3a5c7a9aedce193c', // Coinbase
            '0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43', // Coinbase 2
            '0x77696bb39917c91a0c3908d577d5e322095425ca', // Coinbase 3
            '0x503828976d22510aad0201ac7ec88293211d23da', // Coinbase 4
            '0xddfabcdc4d8ffc6d5beaf154f18b778f892a0740', // Coinbase 5
            '0x3cd751e6b0078be393132286c442345e5dc49699', // Coinbase 6
            '0xb5d85cbf7cb3ee0d56b3bb207d5fc4b82f43f511', // Coinbase 7
            '0xeb2629a2734e272bcc07bda959863f316f4bd4cf', // Coinbase 8
            '0xd688aea8f7d450909ade10c47faa95707b0682d9', // Coinbase 9
            '0x02466e547bfdab679fc49e5041ff6af2765c91a1', // Coinbase 10
            '0x6b76f8b1e9e59913bfe758821887311ba1805cab', // Coinbase 11
            '0x8b4de256180cfec54c436a470af50f9ee2813dbb', // Coinbase 12
            '0xcffad3200574698b78f32232aa9d63eabd290703', // Coinbase Custody
        ]);

        this.knownDefiAddresses = new Set([
            // DeFi protocol addresses
            '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063', // Aave POL
            '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270', // WPOL
            '0x7ceb23fd6f88a99bb5e7e5ed51d11ac5b1e2d0cd', // Aave Lending Pool
            '0x794a61358d6845594f94dc1db02a252b5b4814ad', // Aave Polygon
            '0x1a13f4ca1d028320a707d99520abfefca3998b7f', // Aave Polygon 2
            '0x8dff5e27ea6b7ac08ebfdf9eb090f32ee9a30fcf', // Aave Polygon 3
            '0xa3fa99a148fa48d14ed51d610c367c61876997f1', // Curve miPOL/USDC
            '0x5a6a4d54456819c5ba4bacc9a8f0bc37c9eb0ecc', // Curve AAVE
            '0x8e32fe11b35db68c10326c8b3e5c5b99f5b90e5c', // Curve Factory
            '0x47bb542b9de58b970ba50c9dae444ddb4c16751a', // Curve Polygon
            '0x5757371414417b8c6caad45baef941abc7d3ab32', // Compound III
            '0x8dff5e27ea6b7ac08ebfdf9eb090f32ee9a30fcf', // Compound Polygon
            '0xa5e0829caced8ffdd4de3c43696c57f7d7a678ff', // QuickSwap Router
            '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45', // Uniswap V3 Router
            '0xe592427a0aece92de3edee1f18e0157c05861564', // Uniswap V3 SwapRouter
            '0x1f98431c8ad98523631ae4a59f267346ea31f984', // Uniswap V3 Factory
            '0x0169ec1f8f639b32eec6d923e24c2a2ff45b9dd6', // Uniswap V3 Polygon
            '0x1b02da8cb0d097eb8d57a175b88c7d8b47997506', // SushiSwap Router
            '0xc0788a3ad43d79aa53c09c2cc9db92b73d4c24a6', // SushiSwap Polygon
            '0xdef1c0ded9bec7f1a1670819833240f027b25eff', // 0x Protocol
            '0x61935cbdd02287b511119ddb11aeb42f1593b7ef', // 0x Protocol Polygon
            '0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419', // Chainlink ETH/USD
            '0xab594600376ec9fd91f8e885dadf0ce036862de0', // Chainlink POL/USD
            '0x9aa7fec87ca69695dd1f879567ccf49eeb6c04e8', // Balancer Vault
            '0xba12222222228d8ba445958a75a0704d566bf2c8', // Balancer Vault Polygon
            '0x4e65fe4dba92790696d040ac24aa414708f5c0ab', // Polygon Bridge
            '0x401f6c983ea34274ec46f84d70b31c151321188b', // Polygon ERC20 Bridge
            '0xa0c68c638235ee32657e8f720a23cec1bfc77c77', // Polygon Plasma Bridge
            '0x8484ef722627bf18ca5ae6bcf031c23e6e922b30', // Polygon State Sync
        ]);

        // Cache for API results
        this.addressClassificationCache = new Map();
        
        // Rate limiting
        this.metasleuthDelay = 250; // 4 requests per second max
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    isKnownExchangeOrDefi(address) {
        const addressLower = address.toLowerCase();
        return this.knownExchangeAddresses.has(addressLower) || 
               this.knownDefiAddresses.has(addressLower);
    }

    async classifyAddressBasic(address) {
        const addressLower = address.toLowerCase();
        
        // Check cache first
        if (this.addressClassificationCache.has(addressLower)) {
            return this.addressClassificationCache.get(addressLower);
        }

        // Check known addresses first (faster)
        if (this.isKnownExchangeOrDefi(address)) {
            const result = { 
                isExchangeOrDefi: true, 
                type: this.knownExchangeAddresses.has(addressLower) ? 'exchange' : 'defi',
                source: 'local',
                confidence: 'high'
            };
            this.addressClassificationCache.set(addressLower, result);
            return result;
        }

        // Basic classification using known addresses only

        // Default to individual delegator
        const defaultResult = { 
            isExchangeOrDefi: false, 
            type: 'individual',
            source: 'default',
            confidence: 'low'
        };
        this.addressClassificationCache.set(addressLower, defaultResult);
        return defaultResult;
    }

    classifyFromBasicData(data) {
        const nameTag = (data.name_tag || '').toLowerCase();
        const mainEntity = (data.main_entity || '').toLowerCase();
        
        // Check for exchanges
        const exchangeKeywords = ['exchange', 'deposit', 'withdraw', 'binance', 'coinbase', 'okx', 
                                'kraken', 'huobi', 'gate.io', 'kucoin', 'bitfinex', 'gemini', 
                                'crypto.com', 'bybit', 'ftx', 'cex.io', 'bitstamp'];
        
        const isExchange = exchangeKeywords.some(keyword => 
            nameTag.includes(keyword) || mainEntity.includes(keyword)
        );
        
        if (isExchange) {
            return { isExchangeOrDefi: true, type: 'exchange' };
        }
        
        // Check for DeFi protocols
        const defiKeywords = ['defi', 'uniswap', 'aave', 'compound', 'curve', 'sushiswap', 
                            'balancer', 'yearn', 'makerdao', 'synthetix', 'chainlink',
                            'quickswap', 'polygon bridge', 'protocol', 'vault', 'pool',
                            'lending', 'staking', 'farming', 'liquidity'];
        
        const isDefi = defiKeywords.some(keyword => 
            nameTag.includes(keyword) || mainEntity.includes(keyword)
        );
        
        if (isDefi) {
            return { isExchangeOrDefi: true, type: 'defi' };
        }
        
        // Check for other institutional addresses
        const institutionalKeywords = ['fund', 'treasury', 'institution', 'custody', 'foundation'];
        const isInstitutional = institutionalKeywords.some(keyword => 
            nameTag.includes(keyword) || mainEntity.includes(keyword)
        );
        
        if (isInstitutional) {
            return { isExchangeOrDefi: true, type: 'institutional' };
        }
        
        // Individual wallet/delegator
        return { isExchangeOrDefi: false, type: 'individual' };
    }

    async filterDelegatorAddresses(addresses, options = {}) {
        const {
            excludeExchanges = true,
            excludeDefi = true,
            excludeInstitutional = true,
            maxConcurrency = 5,
            progressCallback = null
        } = options;

        console.log(`🔍 Filtering ${addresses.length} addresses...`);
        
        const results = {
            individualDelegators: [],
            filteredOut: {
                exchanges: [],
                defi: [],
                institutional: [],
                unknown: []
            },
            statistics: {
                total: addresses.length,
                individual: 0,
                exchanges: 0,
                defi: 0,
                institutional: 0,
                unknown: 0
            }
        };

        // Process addresses in batches to respect rate limits
        const batchSize = Math.min(maxConcurrency, 10);
        const batches = [];
        
        for (let i = 0; i < addresses.length; i += batchSize) {
            batches.push(addresses.slice(i, i + batchSize));
        }

        let processed = 0;
        
        for (const batch of batches) {
            const batchPromises = batch.map(async (address) => {
                try {
                    const classification = await this.classifyAddressBasic(address);
                    
                    processed++;
                    if (progressCallback) {
                        progressCallback(processed, addresses.length);
                    }
                    
                    return { address, classification };
                } catch (error) {
                    console.warn(`❌ Error classifying ${address.slice(0, 8)}: ${error.message}`);
                    return { 
                        address, 
                        classification: { 
                            isExchangeOrDefi: false, 
                            type: 'unknown', 
                            source: 'error' 
                        } 
                    };
                }
            });
            
            const batchResults = await Promise.all(batchPromises);
            
            // Process batch results
            for (const { address, classification } of batchResults) {
                results.statistics[classification.type]++;
                
                if (classification.type === 'exchange' && excludeExchanges) {
                    results.filteredOut.exchanges.push({
                        address,
                        name: classification.name,
                        source: classification.source
                    });
                } else if (classification.type === 'defi' && excludeDefi) {
                    results.filteredOut.defi.push({
                        address,
                        name: classification.name,
                        source: classification.source
                    });
                } else if (classification.type === 'institutional' && excludeInstitutional) {
                    results.filteredOut.institutional.push({
                        address,
                        name: classification.name,
                        source: classification.source
                    });
                } else if (classification.type === 'individual' || 
                          (!excludeExchanges && classification.type === 'exchange') ||
                          (!excludeDefi && classification.type === 'defi') ||
                          (!excludeInstitutional && classification.type === 'institutional')) {
                    results.individualDelegators.push({
                        address,
                        classification
                    });
                    results.statistics.individual++;
                } else {
                    results.filteredOut.unknown.push({
                        address,
                        classification
                    });
                }
            }
            
            // Small delay between batches
            if (batches.indexOf(batch) < batches.length - 1) {
                await this.sleep(100);
            }
        }

        console.log(`✅ Filtering complete: ${results.individualDelegators.length} individual delegators identified`);
        console.log(`   Filtered out: ${results.filteredOut.exchanges.length} exchanges, ${results.filteredOut.defi.length} DeFi, ${results.filteredOut.institutional.length} institutional`);
        
        return results;
    }

    printFilterResults(results) {
        console.log('\n📊 DELEGATOR FILTER RESULTS');
        console.log('='.repeat(50));
        console.log(`Total Addresses Analyzed: ${results.statistics.total}`);
        console.log(`Individual Delegators: ${results.statistics.individual} (${((results.statistics.individual/results.statistics.total)*100).toFixed(1)}%)`);
        console.log(`Exchanges Filtered: ${results.statistics.exchanges}`);
        console.log(`DeFi Protocols Filtered: ${results.statistics.defi}`);
        console.log(`Institutional Filtered: ${results.statistics.institutional}`);
        console.log(`Unknown/Error: ${results.statistics.unknown}`);
        
        if (results.filteredOut.exchanges.length > 0) {
            console.log('\n🏪 Top Exchanges Filtered:');
            results.filteredOut.exchanges.slice(0, 5).forEach((item, index) => {
                console.log(`  ${index + 1}. ${item.name || item.address.slice(0, 8) + '...'} (${item.source})`);
            });
        }
        
        if (results.filteredOut.defi.length > 0) {
            console.log('\n🔗 Top DeFi Protocols Filtered:');
            results.filteredOut.defi.slice(0, 5).forEach((item, index) => {
                console.log(`  ${index + 1}. ${item.name || item.address.slice(0, 8) + '...'} (${item.source})`);
            });
        }
    }
}

module.exports = DelegatorFilter;