const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const puppeteer = require('puppeteer-core');
const queryString = require('query-string');

const config = require('./config');

/**
 * @param int ms
 * @returns {Promise<any>}
 */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: {
      width: 1440,
      height: 800,
    },
    // 默认支持 mac os
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    // 用户目录为当前目录下的 /tmp
    userDataDir: path.resolve(__dirname, './tmp'),
    ...config,
  });

  const page = await browser.newPage();
  await page.goto('https://myivc.jd.com/fpzz/index.action');

  // 下载一页
  const downloadOnePage = async () => {
    await page.waitForSelector('.operate a');

    const links = await page.$$('.operate a');
    for (let linkEl of links) {
      const text = await linkEl.evaluate(el => el.innerText);
      if (text === '发票详情') {
        // 如果是发票详情就访问并且下载发票至 dist 目录
        const url = await linkEl.evaluate(el => el.href)
        if (url.indexOf('orderId') > 0) {
          // 通过当前链接 的 orderId 来命名文件名称
          const { query } = queryString.parseUrl(url);
          console.log('downloading invoice from', url)
          const invoicePath = `dist/${query.orderId}.pdf`
          const filename = path.resolve(__dirname, invoicePath);
          if (fs.existsSync(filename)) {
            // 如果文件已经存在，就不需要重复下载
            continue;
          }

          const popupPage = await browser.newPage()
          await popupPage.goto(url)
          try {
            await popupPage.waitForSelector('.download-trigger', {timeout: 1000})
            const href = await popupPage.$eval('.download-trigger', el => el.href)

            // 获取发票的下载链接
            const file = fs.createWriteStream(filename);

            // 开始下载
            http.get(href, response => {
              response.pipe(file);
              file.on('finish', () => file.close());
            });
          } catch (e) {
            console.log('failed to download invoice', e)
          }

          await popupPage.close();
        }
      }
    }

    await sleep(3000);

    // 还有下一页的话
    if (await page.$('.ui-pager-next') !== null) {
      await page.click('.ui-pager-next');
      await downloadOnePage()
    }
  };

  await downloadOnePage();

})();
