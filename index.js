import express from 'express';
import { parse } from 'parse5';
import axios from 'axios';
import * as chromeLauncher from 'chrome-launcher';
import lighthouse from 'lighthouse';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// CORS middleware
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, content-type');
  res.setHeader('Access-Control-Allow-Credentials', true);
  next();
});

// Rate limiting middleware
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests, please try again later.'
});
app.use('/analyze', limiter);

// API endpoint for analyzing website performance
app.post('/analyze', async (req, res) => {
  const { url } = req.body;
  try {
    const startTime = performance.now();
    const response = await axios.get(url);
    const loadTime = performance.now() - startTime;

    const requestSize = response.headers['content-length'] || Buffer.byteLength(response.data, 'utf-8');
    
    const document = parse(response.data);
    const htmlElement = document.childNodes.find((node) => node.nodeName === 'html');
    const bodyElement = htmlElement?.childNodes.find((node) => node.nodeName === 'body');
    const allElements = bodyElement?.childNodes || [];
    const requestCount = allElements.length;

    const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });
    const options = {
      logLevel: 'info',
      output: 'json',
      onlyCategories: ['performance'],
      port: chrome.port,
    };
    const runnerResult = await lighthouse(url, options);
    const audits = JSON.parse(runnerResult.report).audits;

    const ttfb = audits['server-response-time']?.numericValue || null;
    const fcp = audits['first-contentful-paint']?.numericValue || null;
    const lcp = audits['largest-contentful-paint']?.numericValue || null;
    const fid = audits['max-potential-fid']?.numericValue || null;
    const tti = audits['interactive']?.numericValue || null;
    const cls = audits['cumulative-layout-shift']?.numericValue || null;

    await chrome.kill();
    res.status(200).json({
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

export default app;
