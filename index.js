import express from 'express';
import dotenv from 'dotenv';
import axios from 'axios';
import * as parse5 from 'parse5';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import rateLimit from 'express-rate-limit';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());

// CORS middleware
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
  res.setHeader('Access-Control-Allow-Credentials', true);
  next();
});

// Rate limiting middleware
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 100 requests per windowMs
  message: 'Too many requests, please try again later.'
});
app.use('/analyze', limiter);

// API endpoint for analyzing website performance
app.post('/analyze', async (req, res) => {
  const { url } = req.body;
  try {
    // Calculating the load time by measuring the time between the start of the request and the end of the response
    const startTime = performance.now();
    const response = await axios.get(url);
    const loadTime = performance.now() - startTime;

    // Calculating the request size by either using 'content-length' or calculating it manually    
    const requestSize = response.headers['content-length'] || Buffer.byteLength(response.data, 'utf-8');

    // Calculating the request count by counting the number of child nodes in the HTML document's <body> element
    const document = parse5.parse(response.data);
    const htmlElement = document.childNodes.find((node) => node.nodeName === 'html');
    const bodyElement = htmlElement?.childNodes.find((node) => node.nodeName === 'body');
    const allElements = bodyElement?.childNodes || [];
    const requestCount = allElements.length;

    // Running Lighthouse analysis
    const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });
    const options = {
      logLevel: 'info',
      output: 'json',
      onlyCategories: ['performance'],
      port: chrome.port,
    };
    const runnerResult = await lighthouse(url, options);
    const audits = JSON.parse(runnerResult.report).audits;

    // - ttfb (Time to First Byte): The time it takes for the server to start sending the first byte of the response
    const ttfb = audits['server-response-time']?.numericValue || null;

    // - fcp (First Contentful Paint): The time it takes for the browser to render the first piece of content on the page
    const fcp = audits['first-contentful-paint']?.numericValue || null;

    // - lcp (Largest Contentful Paint): The time it takes for the largest content element to render on the page
    const lcp = audits['largest-contentful-paint']?.numericValue || null;

    // - fid (First Input Delay): The time it takes for the browser to respond to the first user interaction
    const fid = audits['max-potential-fid']?.numericValue || null;

    // - tti (Time to Interactive): The time it takes for the page to become fully interactive
    const tti = audits['interactive']?.numericValue || null;

    // - cls (Cumulative Layout Shift): A measure of the visual stability of the page
    const cls = audits['cumulative-layout-shift']?.numericValue || null;

    await chrome.kill();
    res.json({
      loadTime,
      requestSize,
      requestCount,
      ttfb,
      fcp,
      lcp,
      fid,
      tti,
      cls,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
