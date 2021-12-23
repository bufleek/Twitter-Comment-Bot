"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const puppeteer_1 = __importDefault(require("puppeteer"));
const fs_1 = __importDefault(require("fs"));
const secrets_1 = require("./secrets");
const XLSX = require('xlsx');
const exceljs_1 = __importDefault(require("exceljs"));
let workbook = new exceljs_1.default.Workbook();
let worksheet;
let reply = [];
let tweets = [];
let tweetsReplied = [];
let failedReplies = [];
let remaininingTweets = [];
let page;
let searchTag = "";
let replyLimit = 10;
let browser;
let tweetData = [];
let params = {
    headless: false,
    searchTag: "",
    reply: "",
    limit: 10
};
let repliesDir = "./data/tweet_reply_shots";
const dataDir = "./dist/tmp/data";
const excelSheetDir = "./data";
const paramsFile = "./data/params.json";
const tweetsFileName = "/tweets.xlsx";
const errorDir = "./data/errors/images";
const errorsFile = "./data/errors/logs.txt";
class TweetData {
    constructor(tweet, replyLink, image) {
        this.tweet = tweet;
        this.reply = replyLink;
        this.image = image;
    }
}
let getReply = (url) => __awaiter(void 0, void 0, void 0, function* () {
    return new Promise((resolve, reject) => __awaiter(void 0, void 0, void 0, function* () {
        let conversationPage = yield browser.newPage();
        yield conversationPage.setViewport({
            width: 1280, height: 800
        });
        yield conversationPage.goto("https://twitter.com" + url, { waitUntil: "networkidle2" });
        yield sleepFor(1000, 2000);
        yield conversationPage.waitForSelector("div[data-testid='tweetTextarea_0']")
            .catch((e) => __awaiter(void 0, void 0, void 0, function* () {
            failedReplies.push(url);
            console.log(e.message);
            yield writeErrorLog(conversationPage, e.toString());
        }))
            .then(() => __awaiter(void 0, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f;
            yield conversationPage.hover("div[data-testid='tweetTextarea_0']");
            yield conversationPage.focus("div[data-testid='tweetTextarea_0']");
            yield conversationPage.keyboard.type(chooseRandomReply());
            yield sleepFor(3000, 5500);
            yield conversationPage.click("div[data-testid='tweetButtonInline']");
            let tweeted = false;
            let selectors = ["div[aria-live='assertive']", "div[data-testid='toast']"];
            yield Promise.all(selectors.map(selector => new Promise((rsl, reject) => __awaiter(void 0, void 0, void 0, function* () {
                let awaitTweetConfirmation = () => __awaiter(void 0, void 0, void 0, function* () {
                    let el = yield conversationPage.$(selector);
                    if (el != null || tweeted) {
                        tweeted = true;
                        if (el != null && selector === "div[data-testid='toast']") {
                            tweetsReplied.push(url);
                        }
                        else if (el != null) {
                            failedReplies.push(url);
                            console.log("A similar reply exists");
                        }
                        rsl(null);
                    }
                    else {
                        yield awaitTweetConfirmation();
                    }
                });
                yield awaitTweetConfirmation();
            }))));
            yield conversationPage.waitForSelector("div[aria-label='Timeline: Conversation'] article[data-testid='tweet']");
            let comments = yield conversationPage.$$("div[aria-label='Timeline: Conversation'] article[data-testid='tweet'");
            for (let i = 0; i < comments.length; i++) {
                let comment = comments[i];
                let commentLinks = yield comment.$$eval("a[role='link']", els => els.map(el => el.getAttribute("href")));
                let commentLink = yield commentLinks.find(it => (it === null || it === void 0 ? void 0 : it.includes("status")) && it.includes(secrets_1.username));
                if (commentLink != null) {
                    yield comment.hover();
                    let boundingBox = yield ((_a = (yield conversationPage.$("main[role='main']"))) === null || _a === void 0 ? void 0 : _a.boundingBox());
                    let screenshotWidth = (_b = boundingBox === null || boundingBox === void 0 ? void 0 : boundingBox.width) !== null && _b !== void 0 ? _b : 1280;
                    let replyBoundingBox = yield comment.boundingBox();
                    let screenshotHeight = (((_c = replyBoundingBox === null || replyBoundingBox === void 0 ? void 0 : replyBoundingBox.height) !== null && _c !== void 0 ? _c : 0) + ((_d = replyBoundingBox === null || replyBoundingBox === void 0 ? void 0 : replyBoundingBox.y) !== null && _d !== void 0 ? _d : 0));
                    let replyImagePath = repliesDir + "/" + (commentLink === null || commentLink === void 0 ? void 0 : commentLink.replace(/\//g, "_")) + ".png";
                    yield ((_e = (yield conversationPage.$("main[role='main']"))) === null || _e === void 0 ? void 0 : _e.screenshot({
                        path: replyImagePath,
                        fullPage: false,
                        clip: {
                            x: (_f = boundingBox === null || boundingBox === void 0 ? void 0 : boundingBox.x) !== null && _f !== void 0 ? _f : 0,
                            y: 0,
                            width: screenshotWidth,
                            height: screenshotHeight
                        }
                    }));
                    console.log("reply found");
                    let data = { tweet: "https://twitter.com" + url, reply: "https://twitter.com" + commentLink, image: replyImagePath };
                    yield workbook.xlsx.writeFile(excelSheetDir + tweetsFileName);
                    worksheet.addRow(data);
                    tweetData.push(data);
                    break;
                }
            }
        }))
            .catch((e) => __awaiter(void 0, void 0, void 0, function* () {
            console.log(e);
            yield writeErrorLog(conversationPage, e.toString());
        }));
        yield conversationPage.close();
        resolve("null");
    }));
});
function chooseRandomReply() {
    return reply[Math.floor(Math.random() * reply.length)];
}
let writeErrorLog = (page, message) => __awaiter(void 0, void 0, void 0, function* () {
    let time = new Date().getTime();
    let errorImage = errorDir + "/" + time.toString() + ".png";
    yield page.screenshot({
        path: errorImage,
        fullPage: true,
    });
    let error = {
        id: time,
        image: errorImage,
        params,
        repliedTweets: tweetsReplied.length,
        failedReplies: failedReplies.length,
        isLoggedIn: yield isUserLoggedIn(),
        url: yield page.url(),
        message
    };
    if (!fs_1.default.existsSync(errorsFile)) {
        fs_1.default.writeFileSync(errorsFile, JSON.stringify(error));
    }
    else {
        fs_1.default.appendFileSync(errorsFile, "\n\n" + JSON.stringify(error));
    }
});
class Tweet {
    constructor(id, node) {
        this.id = id;
        this.node = node;
    }
    reply() {
        return __awaiter(this, void 0, void 0, function* () {
            if (tweetsReplied.find(it => it == this.id) == null) {
                console.log("replying to tweet ", this.id);
                yield getReply(this.id)
                    .then(() => __awaiter(this, void 0, void 0, function* () {
                    remaininingTweets = remaininingTweets.filter(it => it.id != this.id);
                    yield sleepFor(100, 1000);
                }))
                    .catch((e) => __awaiter(this, void 0, void 0, function* () {
                    remaininingTweets = remaininingTweets.filter(it => it.id != this.id);
                    console.log(e);
                    yield writeErrorLog(page, e.toString());
                })).finally(() => {
                    console.log("Tweets replied: ", tweetsReplied.length);
                });
            }
        });
    }
}
;
let randomIntFromInterval = (min, max) => {
    return Math.floor(Math.random() * (max - min) + min);
};
let sleepFor = (min, max) => __awaiter(void 0, void 0, void 0, function* () {
    let sleepDuration = randomIntFromInterval(min, max);
    console.log("waiting for ", sleepDuration / 1000, " seconds");
    yield page.waitForTimeout(sleepDuration);
});
let login = () => __awaiter(void 0, void 0, void 0, function* () {
    yield page.goto("https://twitter.com/login", { waitUntil: "networkidle2" });
    yield sleepFor(1000, 2000);
    if ((yield page.url()) === "https://twitter.com/home") {
        console.log("Already logged in");
        return;
    }
    let profileLink = yield page.$("a[aria-label='profile']");
    if (profileLink == null) {
        yield page.waitForSelector("input[autocomplete='username']")
            .then(() => __awaiter(void 0, void 0, void 0, function* () {
            yield page.focus("input[autocomplete='username']");
            yield sleepFor(1000, 2000);
            yield page.waitForSelector("input[autocomplete='current-password']");
            yield page.focus("input[autocomplete='current-password']");
            yield sleepFor(1000, 2000);
            yield page.waitForNavigation();
        }))
            .catch((error) => __awaiter(void 0, void 0, void 0, function* () {
            console.log("Login Error");
            console.log(error);
            yield writeErrorLog(page, error.toString());
        }));
    }
});
let isUserLoggedIn = () => __awaiter(void 0, void 0, void 0, function* () {
    let allLinks = yield page.$$eval("a[role='link']", nodes => nodes.map(node => node.textContent));
    return new Promise((resolve, reject) => {
        if (allLinks != null && (allLinks.find(it => (it === null || it === void 0 ? void 0 : it.toLocaleLowerCase()) == "log in") != null || allLinks.find(it => (it === null || it === void 0 ? void 0 : it.toLocaleLowerCase()) == "sign up") != null)) {
            console.log("Not logged in");
            resolve(false);
        }
        else {
            console.log("Logged in");
            resolve(true);
        }
    });
});
let replyTweets = () => __awaiter(void 0, void 0, void 0, function* () {
    tweets = [];
    let pageTweets = yield page.$$("article[data-testid='tweet']");
    yield Promise.all(pageTweets.map(pageTweet => new Promise((resolve, reject) => __awaiter(void 0, void 0, void 0, function* () {
        let allLinks = yield pageTweet.$$eval("a[role='link']", els => els.map((el) => { return el.getAttribute("href"); }));
        let id = null;
        let tweetLinks = allLinks.filter(it => it === null || it === void 0 ? void 0 : it.includes("status"));
        if (tweetLinks.length != 0) {
            id = tweetLinks[0];
        }
        else {
            id = yield pageTweet.$eval("div a", a => a.getAttribute("href"));
        }
        if (id != null) {
            if (tweetsReplied.find(it => it == id) == null && failedReplies.find(it => it == id) == null) {
                tweets.push(new Tweet(id, pageTweet));
            }
        }
        resolve(null);
    }))));
    if (tweets.length == 0) {
        if (pageTweets.length != 0) {
            yield pageTweets[pageTweets.length - 1].hover();
        }
        yield replyTweets();
    }
    remaininingTweets = tweets;
    for (let i = 0; i < tweets.length; i++) {
        let tweet = tweets[i];
        if (tweetsReplied.length >= replyLimit && replyLimit != 0) {
            break;
        }
        yield tweet.reply();
    }
    if (tweetsReplied.length < replyLimit || replyLimit == 0) {
        yield replyTweets();
    }
});
let gotoTweets = () => __awaiter(void 0, void 0, void 0, function* () {
    yield page.goto("https://twitter.com/search?q=" + encodeURIComponent(searchTag.trim()) + "&src=typed_query", { waitUntil: "load" });
    yield sleepFor(1000, 2000);
    yield replyTweets();
});
let main = () => __awaiter(void 0, void 0, void 0, function* () {
    var _g;
    let paramsStr = fs_1.default.readFileSync(paramsFile, "utf-8");
    params = JSON.parse(paramsStr);
    if (params.searchTag == null || params.reply == null || params.searchTag.trim().length == 0) {
        console.log("Required parameters are missing");
        return;
    }
    searchTag = params.searchTag;
    reply = JSON.parse(JSON.stringify(params.reply));
    if (reply.length == 0) {
        console.log("No replies given");
        return;
    }
    try {
        replyLimit = params.limit;
    }
    catch (_h) {
        replyLimit = 0;
    }
    if (!fs_1.default.existsSync(dataDir)) {
        fs_1.default.mkdirSync(dataDir, { recursive: true });
    }
    repliesDir += "/" + searchTag;
    if (!fs_1.default.existsSync(repliesDir)) {
        fs_1.default.mkdirSync(repliesDir, { recursive: true });
    }
    if (!fs_1.default.existsSync(excelSheetDir)) {
        fs_1.default.mkdirSync(excelSheetDir, { recursive: true });
    }
    if (!fs_1.default.existsSync(errorDir)) {
        fs_1.default.mkdirSync(errorDir, { recursive: true });
    }
    if (!fs_1.default.existsSync(excelSheetDir + tweetsFileName)) {
        worksheet = workbook.addWorksheet(searchTag);
    }
    else {
        yield workbook.xlsx.readFile(excelSheetDir + tweetsFileName);
        worksheet = (_g = workbook.worksheets.find(it => it.name == searchTag)) !== null && _g !== void 0 ? _g : workbook.addWorksheet(searchTag);
    }
    worksheet.columns = [
        { header: 'Tweet Link', key: 'tweet', width: 20 },
        { header: 'Reply Link', key: 'reply', width: 20 },
        { header: 'Image Path', key: 'image', width: 20 },
    ];
    browser = yield puppeteer_1.default.launch({
        headless: params.headless,
        userDataDir: dataDir,
        slowMo: 20
    });
    page = yield browser.newPage();
    yield page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    yield login().then(() => __awaiter(void 0, void 0, void 0, function* () {
        yield gotoTweets();
    })).catch((e) => { console.log(e); })
        .finally(() => __awaiter(void 0, void 0, void 0, function* () {
        yield workbook.xlsx.writeFile(excelSheetDir + tweetsFileName);
        yield page.close();
        yield browser.close();
    }));
});
main();
