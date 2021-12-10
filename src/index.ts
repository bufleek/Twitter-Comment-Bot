import puppeteer from 'puppeteer';
import fs from 'fs';
import { username } from './secrets';
const XLSX = require('xlsx');
import exceljs from 'exceljs';
let workbook = new exceljs.Workbook();
let worksheet: exceljs.Worksheet;

let reply = "";
let tweets: Tweet[] = [];
let tweetsReplied: string[] = [];
let remaininingTweets: Tweet[] = [];
let page: puppeteer.Page;
let searchTag = "";
let replyLimit = 10;
let browser: puppeteer.Browser;
let tweetData: TweetData[] = [];

let repliesDir = "./data/tweet_reply_shots";
const dataDir = "./dist/tmp/data";
const excelSheetDir = "./data";
const paramsFile = "./data/params.json";
let tweetsFileName = "/tweets.xlsx";

class TweetData {
    tweet: string;
    reply: string;
    image: string;

    constructor(tweet: string, replyLink: string, image: string) {
        this.tweet = tweet;
        this.reply = replyLink;
        this.image = image;
    }
}

let getReply = async (url: string): Promise<string> => {
    return new Promise(async (resolve, reject) => {
        let conversationPage = await browser.newPage()
        await conversationPage.setViewport({
            width: 1280, height: 800
        })
        await conversationPage.goto("https://twitter.com" + url, { waitUntil: "networkidle2" });
        await sleepFor(1000, 2000);
        await conversationPage.waitForSelector("div[data-testid='tweetTextarea_0']")
            .catch(async () => { })
            .then(async () => {
                await conversationPage.hover("div[data-testid='tweetTextarea_0']")
                await conversationPage.focus("div[data-testid='tweetTextarea_0']")
                await conversationPage.keyboard.type(reply);
                await sleepFor(3000, 5500);
                await conversationPage.click("div[data-testid='tweetButtonInline']");
                let tweeted = false;
                let selectors = ["div[aria-live='assertive']", "div[data-testid='toast']"];
                await Promise.all(selectors.map(selector => new Promise(async (rsl, reject) => {
                    let awaitTweetConfirmation = async () => {
                        let el = await conversationPage.$(selector);
                        if (el != null || tweeted) {
                            tweeted = true;
                            if(el != null){
                                tweetsReplied.push(url);
                            }
                            rsl(null);
                        } else {
                            await awaitTweetConfirmation();
                        }
                    }
                    await awaitTweetConfirmation();
                })))
                await conversationPage.waitForSelector("div[aria-label='Timeline: Conversation'] article[data-testid='tweet']");
                let comments = await conversationPage.$$("div[aria-label='Timeline: Conversation'] article[data-testid='tweet'");
                for (let i = 0; i < comments.length; i++) {
                    let comment = comments[i];
                    let commentLinks = await comment.$$eval("a[role='link']", els => els.map(el => el.getAttribute("href")));
                    let commentLink = await commentLinks.find(it => it?.includes("status") && it.includes(username));
                    if (commentLink != null) {
                        await comment.hover();
                        let replyImagePath = repliesDir + "/" + commentLink?.replace(/\//g, "_") + ".png";
                        await (await conversationPage.$("main[role='main']"))?.screenshot({
                            path: replyImagePath,
                            fullPage: false
                        });
                        console.log("reply found")
                        let data = {tweet: "https://twitter.com" + url, reply: "https://twitter.com" + commentLink, image: replyImagePath}

                        await workbook.xlsx.writeFile(excelSheetDir + tweetsFileName);
                        worksheet.addRow(data);
                        tweetData.push(data);
                        break;
                    }
                }
            })
            .catch((e) => { console.log(e) });

        await conversationPage.close();
        resolve("null");
    });
}

class Tweet {
    id: string;
    node: puppeteer.ElementHandle<Element>;

    constructor(id: string, node: puppeteer.ElementHandle<Element>) {
        this.id = id;
        this.node = node;
    }

    async reply() {
        if (tweetsReplied.find(it => it == this.id) == null) {
            console.log("replying to tweet ", this.id);
            await getReply(this.id)
                .then(async () => {
                    // tweetsReplied.push(this.id);
                    remaininingTweets = remaininingTweets.filter(it => it.id != this.id);
                    await sleepFor(100, 1000);
                })
                .catch((e) => {
                    remaininingTweets = remaininingTweets.filter(it => it.id != this.id);
                    console.log(e)
                }).finally(() => {
                    console.log("Tweets replied: ", tweetsReplied.length);
                });
        }
    }
};

let randomIntFromInterval = (min: number, max: number) => {
    return Math.floor(Math.random() * (max - min) + min)
}

let sleepFor = async (min: number, max: number) => {
    let sleepDuration = randomIntFromInterval(min, max);
    console.log("waiting for ", sleepDuration / 1000, " seconds")
    await page.waitForTimeout(sleepDuration)
}

let login = async () => {
    await page.goto("https://twitter.com/login", { waitUntil: "networkidle2" });
    await sleepFor(1000, 2000);
    if(await page.url() === "https://twitter.com/home"){
        console.log("Already logged in");
        return;
    }
    let profileLink = await page.$("a[aria-label='profile']");
    if (profileLink == null) {
        await page.waitForSelector("input[autocomplete='username']")
            .then(async () => {
                await page.focus("input[autocomplete='username']");
                await sleepFor(1000, 2000);
                await page.waitForSelector("input[autocomplete='current-password']");
                await page.focus("input[autocomplete='current-password']");
                await sleepFor(1000, 2000);
                await page.waitForNavigation();
            })
            .catch((error) => {
                console.log("Already logged in")
            });
    }
}

let isUserLoggedIn = async (): Promise<boolean> => {
    let allLinks = await page.$$eval("a[role='link']", nodes => nodes.map(node => node.textContent));
    console.log(allLinks);
    return new Promise((resolve, reject) => {
        if (allLinks != null && (allLinks.find(it => it?.toLocaleLowerCase() == "log in") != null || allLinks.find(it => it?.toLocaleLowerCase() == "sign up") != null)) {
            console.log("Not logged in");
            resolve(false);
        }
        else {
            console.log("Logged in")
            resolve(true);
        }
    });
}

let checkLoginState = async () => {
    await isUserLoggedIn().then(async (isLoggedIn: boolean) => {
        if (!isLoggedIn) {
            await login()
                .catch(async () => {
                    await gotoTweets();
                })
                .then(async () => {
                    await gotoTweets();
                });
        }
    });
}

let replyTweets = async () => {
    tweets = [];
    let pageTweets = await page.$$("article[data-testid='tweet']");
    await Promise.all(pageTweets.map(pageTweet => new Promise(async (resolve, reject) => {
        let allLinks = await pageTweet.$$eval("a[role='link']", els => els.map((el) => { return el.getAttribute("href") }));
        let id: string | null = null;
        let tweetLinks = allLinks.filter(it => it?.includes("status"));
        if (tweetLinks.length != 0) {
            id = tweetLinks[0]
        } else {
            id = await pageTweet.$eval("div a", a => a.getAttribute("href"));
        }

        if (id != null) {
            if (tweetsReplied.find(it => it == id) == null) {
                tweets.push(new Tweet(id, pageTweet))
            }
        }
        resolve(null)
    })));
    if (tweets.length == 0) {
        if (pageTweets.length != 0) {
            await pageTweets[pageTweets.length - 1].hover();
        }
        await replyTweets();
    }

    remaininingTweets = tweets;
    for (let i = 0; i < tweets.length; i++) {
        let tweet = tweets[i];
        if (tweetsReplied.length >= replyLimit && replyLimit != 0) {
            break;
        }
        await tweet.reply();
    }

    if (tweetsReplied.length < replyLimit || replyLimit == 0) {
        await replyTweets();
    }
}

let gotoTweets = async () => {
    await page.goto("https://twitter.com/search?q=" + encodeURIComponent(searchTag.trim()) + "&src=typed_query", { waitUntil: "load" });
    await sleepFor(1000, 2000);
    await replyTweets();
}

let writeDataToSheet = () => {
    let fileName = excelSheetDir + tweetsFileName;
    let ws = XLSX.utils.json_to_sheet(tweetData)
    let wb;
    try { wb = XLSX.readFile(fileName); } catch { wb = XLSX.utils.book_new(); }
    XLSX.utils.book_append_sheet(wb, ws, searchTag);
    XLSX.writeFile(wb, fileName);
}

let main = async () => {
    let paramsStr = fs.readFileSync(paramsFile, "utf-8");
    let params = JSON.parse(paramsStr);

    if (params.searchTag == null || params.reply == null || params.searchTag.trim().length == 0 || params.reply.trim().length == 0) {
        console.log("Required parameters are missing");
        return;
    }

    searchTag = params.searchTag;
    reply = params.reply;
    try { replyLimit = params.limit; } catch { replyLimit = 0 }

    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true })
    }
    repliesDir += "/" + searchTag;
    if (!fs.existsSync(repliesDir)) {
        fs.mkdirSync(repliesDir, { recursive: true });
    }

    if (!fs.existsSync(excelSheetDir)) {
        fs.mkdirSync(excelSheetDir, { recursive: true })
    }
    if (!fs.existsSync(excelSheetDir + tweetsFileName)) {
        worksheet = workbook.addWorksheet(searchTag);
    } else {
        await workbook.xlsx.readFile(excelSheetDir + tweetsFileName);
        worksheet = workbook.worksheets.find(it => it.name == searchTag) ?? workbook.addWorksheet(searchTag);
    }
    worksheet.columns = [
        {header: 'Tweet Link', key: 'tweet', width: 20},
        {header: 'Reply Link', key: 'reply', width: 20},
        {header: 'Image Path', key: 'image', width: 20},
    ];

    browser = await puppeteer.launch({
        headless: params.headless,
        userDataDir: dataDir,
        slowMo: 20
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await login().then(async () => {
        await gotoTweets();
    }).catch((e) => { console.log(e) })
        .finally(async () => {
            // if (tweetData.length != 0) {
            //     writeDataToSheet()
            // }
            await workbook.xlsx.writeFile(excelSheetDir + tweetsFileName);
            await page.close();
            await browser.close();
        });
}
main();