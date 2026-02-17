#!/usr/bin/env node

/**
 * Test script for MetaSleuth API integration
 * Run this to verify your API key is working
 */

const FundFlowTracker = require('./FundFlowTracker');

async function testMetaSleuthAPI() {
    console.log('🧪 Testing MetaSleuth API Integration');
    console.log('=====================================\n');
    
    const flowTracker = new FundFlowTracker();
    
    // Check if API key is set
    if (flowTracker.metasleuthApiKey === 'your_metasleuth_api_key') {
        console.log('❌ MetaSleuth API key not set!');
        console.log('Please set the METASLEUTH_API_KEY environment variable');
        console.log('Example: export METASLEUTH_API_KEY="your_actual_api_key"');
        return;
    }
    
    console.log('✅ API key found, testing with known addresses...\n');
    
    // Test addresses (known entities)
    const testAddresses = [
        '0x5e3346444010135322268a0ca24b70e5b1d0d52a', // Binance deposit
        '0x46340b20830761efd32832a74d7169b29feb9758', // Crypto.com 
        '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270', // WPOL
        '0x1234567890123456789012345678901234567890'  // Unknown address
    ];
    
    console.log('Testing address classification...\n');
    
    for (const address of testAddresses) {
        try {
            console.log(`🔍 Testing: ${address}`);
            
            const classification = await flowTracker.classifyAddress(address);
            
            console.log(`  Type: ${classification.type}`);
            console.log(`  Name: ${classification.name}`);
            console.log(`  Source: ${classification.source}`);
            
            if (classification.metaSleuthData) {
                console.log(`  MetaSleuth Label: ${classification.nameTag}`);
                console.log(`  Main Entity: ${classification.mainEntity}`);
            }
            
            console.log(''); // Empty line
            
        } catch (error) {
            console.error(`❌ Error testing ${address}: ${error.message}`);
            
            if (error.response?.status === 401) {
                console.log('🔑 Authentication failed - check your API key');
                break;
            } else if (error.response?.status === 429) {
                console.log('⏳ Rate limit hit - API is working but too many requests');
                break;
            }
        }
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    console.log('🎯 Test completed!');
    console.log('\nIf you see MetaSleuth labels above, the integration is working correctly.');
    console.log('If you see mostly "local" or "default" sources, check your API key or rate limits.');
}

// Handle errors gracefully
testMetaSleuthAPI().catch(error => {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
});