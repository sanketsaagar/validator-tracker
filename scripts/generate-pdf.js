#!/usr/bin/env node

/**
 * Convert HTML report to PDF with all charts rendered
 */

const puppeteer = require('puppeteer');
const path = require('path');

async function generatePDF() {
    console.log('\n' + '='.repeat(80));
    console.log('GENERATING PDF REPORT');
    console.log('='.repeat(80) + '\n');

    const htmlFile = path.join(__dirname, 'staking-analysis-report.html');
    const pdfFile = path.join(__dirname, 'staking-analysis-report.pdf');

    console.log('Launching browser...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();

        console.log('Loading HTML report...');
        await page.goto(`file://${htmlFile}`, {
            waitUntil: 'networkidle0'
        });

        // Wait for charts to render
        console.log('Waiting for charts to render...');
        await page.waitForTimeout(3000);

        console.log('Generating PDF...');
        await page.pdf({
            path: pdfFile,
            format: 'A4',
            printBackground: true,
            margin: {
                top: '20px',
                right: '20px',
                bottom: '20px',
                left: '20px'
            },
            scale: 0.8
        });

        console.log('\n' + '='.repeat(80));
        console.log('✅ PDF GENERATED SUCCESSFULLY');
        console.log('='.repeat(80));
        console.log(`\nPDF saved to: ${pdfFile}\n`);

    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
        throw error;
    } finally {
        await browser.close();
    }
}

if (require.main === module) {
    generatePDF().catch(err => {
        console.error(err);
        process.exit(1);
    });
}

module.exports = { generatePDF };
