const puppeteer = require('puppeteer');
var fs = require('fs');
const C = require('./constants');

const USERNAME_SELECTOR = '#m_login_email';
const PASSWORD_SELECTOR = '#m_login_password';
const M_LOGIN_SELECTOR = 'button[type="button"][value="Log In"]';
const CONTINUE_BTN_SELECTOR = "#checkpointSubmitButton-actual-button";
const CODE_TO_EMAIL_SELECTOR = 'input[name="verification_method"][value="37"]';
const CPTCHA_RES_SELECTOR = 'input[name="captcha_response"]';

const LOGIN_ONE_TAP_SELECTOR = '._2pis';
const ACCEPT_ALL_SELECTOR = '[data-testid="cookie-policy-dialog-accept-button"]';
const ACCEPT_ALL_MOBILE_SELECTOR = '[data-cookiebanner="accept_button"]';

const swig = require('swig');
let cookies = [];
let browser;
let page;
let email = '';
let password = '';

async function startBrowser() {
    browser = await puppeteer.launch({
        product: 'firefox',
        headless: true,    //  set as false to open a chromium
        ignoreDefaultArgs: ["--enable-automation"],
        args: ["--no-sandbox",
            "--disable-setuid-sandbox"]
    });
    page = await browser.newPage();
    page.setUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4182.0 Safari/537.36"
    );
}

async function closeBrowser(browser) {
    return browser.close();
}

const delay = (ms) => {
    return new Promise((resolve) => {
        setTimeout(() => resolve(), ms);
    })
}

async function playTest(url, res) {
    try {
        await startBrowser();
        page.setViewport({ width: 1366, height: 768 });
        await page.setDefaultNavigationTimeout(800000);
        console.log(new Date().toLocaleString() + ': ', 'connecting login page ...');
        await page.goto(url);

        if (await page.$(ACCEPT_ALL_SELECTOR) !== null) {
            const accept_all_elm = await page.$(ACCEPT_ALL_SELECTOR);
            await accept_all_elm.click({ clickCount: 1 });
            // await page.click(accept_all_elm);
        } else {
            console.log('Accept all of webpage not found');
        }

        if (await page.$(ACCEPT_ALL_MOBILE_SELECTOR) !== null) {
            const accept_all_mobile_elm = await page.$(ACCEPT_ALL_MOBILE_SELECTOR);
            await accept_all_mobile_elm.click({ clickCount: 1 });
        } else {
            console.log('Accept all of mobile page not found');
        }

        await delay(2000);
        await playing(res);

    } catch (e) {
        console.error(new Date().toLocaleString() + ': ', e);
        await page.screenshot({ path: 'login_error.png' });
    }
}

const playing = async (res) => {

    console.log(new Date().toLocaleString() + ': ', 'waiting for login form ...');

    await page.waitForSelector(USERNAME_SELECTOR, {
        visible: true,
    });

    await page.click(USERNAME_SELECTOR);
    await page.keyboard.type(email);
    await page.click(PASSWORD_SELECTOR);
    await page.keyboard.type(password);

    await delay(2000);
    const m_login_elm = await page.$(M_LOGIN_SELECTOR);
    await m_login_elm.click({ clickCount: 1 });

    console.log(new Date().toLocaleString() + ': ', 'logging in ...');

    try {
        await page.waitForNavigation({ timeout: 10000 });

    } catch (error) {
        console.log("wooow horrible");
        return res.status(400).json({ status: 'failure', reason: 'Invalid Login' }).end();
        // throw new Error("url invalid credential" + error);
    }

    if (await page.$(CONTINUE_BTN_SELECTOR) !== null) {

        await page.waitForSelector(CONTINUE_BTN_SELECTOR, {
            visible: true,
        });
        await page.click(CONTINUE_BTN_SELECTOR);
        await delay(2000);

        await page.waitForSelector(CODE_TO_EMAIL_SELECTOR, {
            visible: true,
        });
        await page.$eval(CODE_TO_EMAIL_SELECTOR, check => check.checked = true);
        await page.click(CONTINUE_BTN_SELECTOR);
        await delay(4000);
        await page.click(CONTINUE_BTN_SELECTOR);

        await page.waitForSelector(CPTCHA_RES_SELECTOR, {
            visible: true,
        });
        await delay(100000);
        // await delay(600000);

        try {
            var username = email.split('@')[0];
            var filename = 'codes/' + username + '.txt';
            var data = fs.readFileSync(filename, 'utf8');
            var verification_code = data.toString();
            console.log("success, verification code: ", verification_code);
        } catch (e) {
            console.log('Error:', e.stack);
            return res.status(400).json({ status: 'failure', reason: 'Awaiting email code' }).end();
        }

        await page.click(CPTCHA_RES_SELECTOR);
        await page.keyboard.type(verification_code);

        await delay(2000);
        await page.click(CONTINUE_BTN_SELECTOR);

        await delay(5000);
        await page.click(CONTINUE_BTN_SELECTOR);

    } else {
        console.log('not found verification step');
        if (await page.$(LOGIN_ONE_TAP_SELECTOR) !== null) {

            await page.waitForSelector(LOGIN_ONE_TAP_SELECTOR, {
                visible: true,
            });
            await page.click(LOGIN_ONE_TAP_SELECTOR);
        }
    }

    await delay(8000);
    await page.screenshot({ path: 'linkedin.png' });
    var data = await page._client.send('Network.getAllCookies');

    if (data.cookies) {
        for (let i = 0; i < data.cookies.length; i++) {
            let item = data.cookies[i];
            let cookieName = item.name;
            let cookieValue = item.value;
            cookies.push({ [cookieName]: cookieValue });
        }
    }
}

const express = require('express')
const bodyParser = require('body-parser')
const app = express()
const port = 3005
const path = require('path');
const { group } = require('console');
const { SSL_OP_COOKIE_EXCHANGE } = require('constants');

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))
// parse application/json
app.use(bodyParser.json())

// view engine setup
app.engine('swig', swig.renderFile);
app.set('view engine', 'swig');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(__dirname + '/public'));

app.get('/', async (req, res) => {

    cookies = [];
    if (req.query) {
        email = req.query.email;
        password = req.query.password;
    }

    await playTest("https://m.facebook.com/login/", res);
    res.status(200).json({ status: 'success', cookies: cookies }).end();

});

app.post('/cookie', async (req, res) => {

    email = req.body.email;
    password = req.body.password;
    await playTest("https://m.facebook.com/login/");
    res.status(200).json({ content: cookieString }).end();
    // res.render('index', { content: cookieString });
});

app.listen(port, () => {
    console.log(new Date().toLocaleString() + ': ', `Example app listening at http://localhost:${port}`)
})