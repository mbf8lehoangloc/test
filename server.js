// server.js
require('dotenv').config();
const express     = require('express');
const axios       = require('axios');
const crypto      = require('crypto');
const mysql       = require('mysql2/promise');
const cors        = require('cors');
const qs          = require('querystring');
const cron        = require('node-cron');
const chalk       = require('chalk'); // npm install chalk@4
const { now } = require('moment');
  
  const yellow = chalk.bold.hex('#dcdcaa');
  const green = chalk.green;
  const blue = chalk.blue;
  const red = chalk.red; //chalk.red.bold: đỏ đậm
  const pink = chalk.hex('#ff86d2ff');

const app  = express();
const PORT = process.env.PORT || 9221;
app.listen(PORT, () => {
  console.log(`* Server is listening in ᶠᶸᶜᵏᵧₒᵤ!  http://localhost:${pink(PORT)} ꧁⎝ 𓆩༺✧༻𓆪 ⎠꧂`);
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// --- 1. Cấu hình DB ---
const pool = mysql.createPool({
  host:              process.env.DB_HOST,
  user:              process.env.DB_USER,
  password:          process.env.DB_PASS,
  database:          process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit:   5
});

(async () => { // Thông báo kết nối DATABASE và thời gian thực hiện kết nối
  // 1. Bắt đầu đo thời gian
  const startTime = process.hrtime.bigint();
  try {
  // 2. Mở kết nối
    const conn = await pool.getConnection();
  // 3. Tính thời gian đã trôi qua (ms)
    const durationNs = process.hrtime.bigint() - startTime;
    let durationMs = Number(durationNs / BigInt(1e6));
    console.log(`「✔ ᵛᵉʳᶦᶠᶦᵉᵈ」 MySQL connected successfully! in ${durationMs} ms` );
    console.log();
    conn.release();
  } catch (err) {
    console.error('❌ MySQL connection failed:', err.message);
    process.exit(1);
  }
})();


// --- 3. Hàm tạo signature cho OKX ---
function getSignature(timestamp, method, requestPath, body = '') {
  const preHash = timestamp + method + requestPath + body;
  return crypto
    .createHmac('sha256', process.env.OKX_SECRET_KEY)
    .update(preHash)
    .digest('base64');
}


async function okxRequest(method, path, body = '') {
  const timestamp = new Date().toISOString();
  const signature = getSignature(timestamp, method, path, body);

  const headers = {
    'OK-ACCESS-KEY': process.env.OKX_API_KEY,
    'OK-ACCESS-SIGN': signature,
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': process.env.OKX_PASSPHRASE,
    'Content-Type': 'application/json'
  };

  const url = `https://www.okx.com${path}`; // ✅ Khai báo rõ ràng path
  const config = { method, url, headers };
  if (method === 'POST') config.data = body;

  const res = await axios(config);
  return res.data;
}

const symbols = ['BERA-USDT', 'IP-USDT', 'PARTI-USDT', 'KAITO-USDT', 'XAUT-USDT', 'WLFI-USDT', 'ONDO-USDT'];
const ccys = ['BERA', 'IP', 'PARTI', 'KAITO', 'USDT', 'WLFI', 'ONDO'];

function formatDateTimeLocale(date) {
  const timePart = date.toLocaleTimeString('en-GB');    // "HH:MM:SS"
  const datePart = date.toLocaleDateString('en-GB');    // "DD/MM/YYYY"
  return `${timePart}, ${datePart}`;
}

// Helper format thời gian chung
function formatDateTime(input) {
  const date    = new Date(input);
  const day     = String(date.getDate()).padStart(2, '0');
  const month   = String(date.getMonth() + 1).padStart(2, '0');
  const year    = date.getFullYear();

  const hour    = String(date.getHours()).padStart(2, '0');
  const minute  = String(date.getMinutes()).padStart(2, '0');
  const second  = String(date.getSeconds()).padStart(2, '0');

  return `${day}/${month}/${year} - ${hour}:${minute}:${second}`;
}

/**
 * Fetch Lending Rate History from OKX và lưu vào DB
 * @param {string} [from] ISO date string, ví dụ "2025-07-01T00:00:00Z"
 * @param {number} [top]  Số bản ghi muốn lấy (max 100)
 */

async function fetchAndStoreLendingRateHistory(from, top = 100) {
  const method    = 'GET';
  const basePath  = '/api/v5/finance/savings/lending-rate-history';
  const qp        = {};

  if (from) qp.after = new Date(from).getTime();
  qp.limit = Math.min(parseInt(top, 10) || 100, 100);

  const qsStr       = require('querystring').stringify(qp);
  const requestPath = qsStr ? `${basePath}?${qsStr}` : basePath;
  const ts          = new Date().toISOString();
  const signature   = getSignature(ts, method, requestPath);
  const url         = 'https://www.okx.com' + requestPath;

  try {
    const { data } = await axios.get(url, {
      headers: {
        'OK-ACCESS-KEY':        process.env.OKX_API_KEY,
        'OK-ACCESS-SIGN':       signature,
        'OK-ACCESS-TIMESTAMP':  ts,
        'OK-ACCESS-PASSPHRASE': process.env.OKX_PASSPHRASE
      }
    });

    const items = data.data || [];
    for (const it of items) {
      const ccy = it.ccy ?? null;
      const amt = it.amt != null ? Number(it.amt) : null;
      const rate= it.rate != null ? Number(it.rate) : null;
      const recTs = it.ts ? new Date(Number(it.ts)) : null;

      try {
        await pool.execute(
          `INSERT INTO lending_rate_history
             (ccy, amt, rate, ts)
           VALUES (?, ?, ?, ?)`,
          [ccy, amt, rate, recTs]
        );
      } catch (e) {
        console.warn('⚠️ Skip insert:', e.message);
      }
    }
    const now = new Date();
    console.log(`✅ Stored ${items.length} records --- Simple Earn --- : at ${formatDateTimeLocale(now)}.`); // SIMPLE EARN
    return { ok: true, fetched: items.length };
  } catch (err) {
    console.error(`❌ Fetch error [${err.response?.status}]:`, err.message);
    return { ok: false, error: err.response?.data?.msg || err.message };
  }
}

cron.schedule('05 * * * *',
  () => {
    fetchAndStoreLendingRateHistory()
      .then(() => console.log('🎉Simple Earn offer complete'), console.log())
      .catch(e => console.error('❌ Error in fetch Simple Earn:', e));
  },
  { tz: 'Asia/Ho_Chi_Minh' }
);




// Fetch và lưu “Staking DeFi Offers” --- On-Chain Earn
async function fetchDefiOffers() {
  const method      = 'GET';
  const requestPath = '/api/v5/finance/staking-defi/offers';
  const timestamp   = new Date().toISOString();
  const url         = 'https://www.okx.com' + requestPath;

  const headers = {
    'OK-ACCESS-KEY':        process.env.OKX_API_KEY,
    'OK-ACCESS-SIGN':       getSignature(timestamp, method, requestPath),
    'OK-ACCESS-TIMESTAMP':  timestamp,
    'OK-ACCESS-PASSPHRASE': process.env.OKX_PASSPHRASE
  };

  try {
    // console.log(`🔍 Fetching DeFi offers: ${url}`);
    const { data } = await axios.get(url, { headers });
    const items = data.data || [];

    for (const item of items) {
      // Destructure và gán fallback null
      const ccy                      = item.ccy                      ?? null;
      const productId                = item.productId                ?? null;
      const protocol                 = item.protocol                 ?? null;
      const protocolType             = item.protocolType             ?? null;
      const term                     = item.term                     ?? null;
      const apy                      = item.apy                      ?? null;
      const earlyRedeem              = item.earlyRedeem              ?? null;
      const investData               = item.investData               ?? [];
      const earningData              = item.earningData              ?? [];
      const state                    = item.state                    ?? null;
      const redeemPeriod             = item.redeemPeriod             ?? [];
      const fastRedemptionDailyLimit = item.fastRedemptionDailyLimit ?? null;

      // Chuyển array/object thành JSON string, map undefined→null
      const params = [
        ccy,
        productId,
        protocol,
        protocolType,
        term,
        apy,
        earlyRedeem,
        JSON.stringify(investData),
        JSON.stringify(earningData),
        state,
        JSON.stringify(redeemPeriod),
        fastRedemptionDailyLimit
      ].map(v => v === undefined ? null : v);

      // Insert vào MySQL
      await pool.execute(
        `INSERT INTO defi_offers
          (ccy, productId, protocol, protocolType, term, apy, earlyRedeem,
           investData, earningData, state, redeemPeriod, fastRedemptionDailyLimit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params
      );
    }
    const now = new Date();
    console.log(`✅ Stored ${items.length} records DeFi offers --- On-Chain Earn ---: at ${formatDateTimeLocale(now)}`);
  } catch (err) {
    console.error(
      `❌ Lỗi khi fetch DeFi offers [${err.response?.status}]:`,
      err.response?.data?.msg || err.message
    );
  }
}

// Chạy ngay và định kỳ mỗi 1 giờ
// Cách 1: setInterval(fetchDefiOffers, 60*60*1000);
// 25 * * * *   → chạy vào phút thứ 25 của mọi giờ  
// Cách 2: cron.schedule();
cron.schedule('05 * * * *',
  () => {
    // console.log();
    // console.log('🕕 Starting hourly fetchDefiOffers at', new Date().toLocaleString());
    fetchDefiOffers()
      .then(() => console.log('🎉On-Chain Earn offer complete'), console.log())
      .catch(e => console.error('❌ Error in fetch On-Chain Earn:', e));
  },
  { tz: 'Asia/Ho_Chi_Minh' }
);

app.post('/api/lending-rate-history/fetch', async (req, res) => {
  const { from, top } = req.body;
  if (from && isNaN(Date.parse(from))) {
    return res.status(400).json({ error: 'Invalid from date' });
  }
  const result = await fetchAndStoreLendingRateHistory(from, top);
  if (result.ok) {
    res.json({ status: 'fetched', count: result.fetched });
  } else {
    res.status(500).json({ status: 'error', message: result.error });
  }
});


function convertToDatetime(ms) {
  if (!ms || ms === '0') return null;
  return new Date(Number(ms)).toISOString().slice(0, 19).replace('T', ' ');
}

async function fetchAndStoreOrders() {
  const method = 'GET';
  const requestPath = '/api/v5/finance/staking-defi/orders-history';
  const timestamp = new Date().toISOString();
  const url         = 'https://www.okx.com' + requestPath;

  const headers = {
    'OK-ACCESS-KEY':        process.env.OKX_API_KEY,
    'OK-ACCESS-SIGN':       getSignature(timestamp, method, requestPath),
    'OK-ACCESS-TIMESTAMP':  timestamp,
    'OK-ACCESS-PASSPHRASE': process.env.OKX_PASSPHRASE,
    'Content-Type': 'application/json'
  };

  try {
    const  response  = await axios.get(url, { headers });
    const orders = response.data.data;

    for (const order of orders) {
      const {
        ordId, productId, protocolType, apy, purchasedTime,
        redeemedTime, tag, investData = [], earningData = []
      } = order;

      const invest = investData[0] || {};
      const earn = earningData[0] || {}; // ✅ Sửa lỗi ở đây

      const purchasedDatetime = convertToDatetime(purchasedTime);
      const redeemedDatetime = convertToDatetime(redeemedTime);

      // INSERT dòng invest đầu tiên
      if (investData.length > 0) {
        const invest = investData[0];
        await pool.execute(
          `INSERT INTO staking_activity (
            ordId, productId, protocolType, ccy, amt, apy,
            purchasedTime, redeemedTime, tag, type,
            earningType, realizedEarnings
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            amt = VALUES(amt),
            apy = VALUES(apy),
            purchasedTime = VALUES(purchasedTime),
            redeemedTime = VALUES(redeemedTime),
            tag = VALUES(tag),
            earningType = VALUES(earningType),
            realizedEarnings = VALUES(realizedEarnings)`,
          [
            ordId, productId, protocolType, invest.ccy, invest.amt, apy,
            purchasedDatetime, redeemedDatetime, tag, 'invest',
            earn.earningType || null, earn.realizedEarnings || null
          ]
        );
      }

      // UPDATE dòng earning đầu tiên
      if (earningData.length > 0) {
        const earn = earningData[0];
        await pool.execute(
          `UPDATE staking_activity
           SET earningType = ?, realizedEarnings = ?
           WHERE ordId = ?`,
          [earn.earningType, earn.realizedEarnings || 0, ordId]
        );
      }
    }

    console.log('✅ Dữ liệu đã được lưu vào MySQL');
    
  } catch (error) {
    console.error('❌ Lỗi khi lấy hoặc lưu dữ liệu:', error.response?.data || error.message);
  }
}

// fetchAndStoreOrders();



async function fetchAndStoreActiveOrders() {
  const method = 'GET';
  const requestPath = '/api/v5/finance/staking-defi/orders-active';
  const timestamp = new Date().toISOString();
  const url         = 'https://www.okx.com' + requestPath;

  const headers = {
    'OK-ACCESS-KEY':        process.env.OKX_API_KEY,
    'OK-ACCESS-SIGN':       getSignature(timestamp, method, requestPath),
    'OK-ACCESS-TIMESTAMP':  timestamp,
    'OK-ACCESS-PASSPHRASE': process.env.OKX_PASSPHRASE,
    'Content-Type': 'application/json'
  };

  try {
    const  response  = await axios.get(url, { headers });
    const orders = response.data.data;

    for (const order of orders) {
      const {
        ordId, ccy, productId, state, protocol, protocolType, term, apy,
        purchasedTime, estSettlementTime, cancelRedemptionDeadline, tag,
        investData = [], earningData = [], fastRedemptionData = []
      } = order;

      const invest = investData[0] || {};
      const earn = earningData[0] || {};
      const fast = fastRedemptionData[0] || {};

      const purchasedDatetime = convertToDatetime(purchasedTime);
      const estSettleDatetime = convertToDatetime(estSettlementTime);
      const cancelDeadlineDatetime = convertToDatetime(cancelRedemptionDeadline);

      await pool.execute(
        `INSERT INTO active_staking_orders (
          ordId, ccy, productId, state, protocol, protocolType, term, apy,
          investCcy, investAmt, earningCcy, earningType, earnings,
          fastRedeemCcy, fastRedeemAmt,
          purchasedTime, estSettlementTime, cancelRedemptionDeadline, tag
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          state = VALUES(state),
          earnings = VALUES(earnings),
          earningType = VALUES(earningType),
          fastRedeemAmt = VALUES(fastRedeemAmt),
          cancelRedemptionDeadline = VALUES(cancelRedemptionDeadline)`,
        [
          ordId, ccy, productId, state, protocol, protocolType, term, apy,
          invest.ccy || null, invest.amt || null,
          earn.ccy || null, earn.earningType || null, earn.earnings || null,
          fast.ccy || null, fast.redeemingAmt || null,
          purchasedDatetime, estSettleDatetime, cancelDeadlineDatetime, tag
        ]
      );
    }

    console.log('✅ Dữ liệu đơn staking đang hoạt động đã được lưu vào MySQL');
    
  } catch (error) {
    console.error('❌ Lỗi xử lý:', error.response?.data || error.message);
  }
}

// fetchAndStoreActiveOrders();









const MS_IN_HOUR = 24 * 60 * 60 * 1000;
const START_DATE = new Date(Date.now() - (60 * 60 * 1000)); //'2025-06-01T00:00:00Z'
console.log(START_DATE.toLocaleString());


// const symbols = ['XAUT-USDT'];

async function fetchHistoricalKline(symbol, startDate = START_DATE ) {
  try {
    let startTs = new Date(startDate).getTime();
    const nowTs = Date.now();

    while (startTs <= nowTs) {
      const url = `https://www.okx.com/api/v5/market/candles` +
                  `?instId=${symbol}` +
                  `&bar=1D` +
                  `&before=${startTs}` + // đổi before thành after sẽ lấy thời gian trước đó
                  `&limit=100`;
      const res = await axios.get(url);
      const data = res.data.data;
      
      if (!data.length) break;

      for (let candle of data) {
        const [ts, o, h, l, c, vol] = candle;
        const timestamp = new Date(parseInt(ts));
        
        await pool.execute(
          `INSERT INTO okx_kline (symbol, timestamp, open, high, low, close, volume)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [symbol, timestamp, o, h, l, c, vol]
        );
      }

      console.log(`✅ Đã lưu ${data.length} nến cho ${symbol} từ ${new Date().toISOString()}`);

      startTs += MS_IN_HOUR * data.length;
    }

  } catch (err) {
    console.error(`❌ Lỗi lấy lịch sử nến ${symbol}:`, err.message);
  }
}
cron.schedule('0 0 * * *', () => {
  console.log();
  console.log('🕛 Daily fetch start:', new Date().toLocaleString());

  (async () => {
    for (let sym of symbols) {
      try {
        await fetchHistoricalKline(sym);
        console.log(`✔️ ${sym}`);
      } catch (e) {
        console.error(`❌ ${sym} error:`, e);
      }
    }
  })();

}, { tz: 'Asia/Ho_Chi_Minh' });



async function fetchHistoricalKline_hour(symbol, startDate = START_DATE ) {
  try {
    let startTs = new Date(startDate).getTime();
    const nowTs = Date.now();

    while (startTs <= nowTs) {
      const url = `https://www.okx.com/api/v5/market/candles` +
                  `?instId=${symbol}` +
                  `&bar=1H` +
                  `&before=${startTs}` + // đổi before thành after sẽ lấy thời gian trước đó
                  `&limit=100`;
      const res = await axios.get(url);
      const data = res.data.data;
      
      if (!data.length) break;

      for (let candle of data) {
        const [ts, o, h, l, c, vol] = candle;
        const timestamp = new Date(parseInt(ts));
        
        await pool.execute(
          `INSERT IGNORE INTO okx_kline_hour (symbol, timestamp, open, high, low, close, volume)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE 
           symbol = VALUES(symbol), 
           timestamp = VALUES(timestamp),
           volume = VALUES(volume)
           `,
          [symbol, timestamp, o, h, l, c, vol]
        );
      }

      console.log(`✅ Đã lưu ${data.length} nến cho ${symbol} từ ${new Date().toISOString()}`);

      startTs += MS_IN_HOUR * data.length;
    }

  } catch (err) {
    console.error(`❌ Lỗi lấy lịch sử nến ${symbol}:`, err.message);
  }
}
cron.schedule('07 * * * *', () => {
  console.log();
  console.log('🕛 Daily fetch start:', new Date().toLocaleString());

  (async () => {
    for (let sym of symbols) {
      try {
        await fetchHistoricalKline_hour(sym);
        console.log(`✔️ ${sym}`);
      } catch (e) {
        console.error(`❌ ${sym} error:`, e);
      }
    }
  })();

}, { tz: 'Asia/Ho_Chi_Minh' });



// Select DAY 
async function fetchHistoricalKline_selected(symbol) {
  const windowStart = new Date('2025-09-01T00:00:00Z').getTime();
  const windowEnd   = new Date('2025-09-11T00:00:00Z').getTime();
  console.log(formatDateTime(windowStart), formatDateTime(windowEnd));

  let cursor = windowStart;

  while (cursor < windowEnd) {
    await delay(300);

    const params = new URLSearchParams({
      instId:   symbol,
      bar:      '1D', 
      before:   String(cursor),
      after:    String(windowEnd),
      limit:    '10'
    });

    const url = `https://www.okx.com/api/v5/market/candles?${params}`;
    const resp = await axios.get(url);
    const { code, data } = resp.data;

    if (code !== '0') {
      throw new Error(`OKX API error: ${resp.data.msg || code}`);
    }

    if (!data.length) {
      console.log(`❌ Không có dữ liệu cho ${symbol} tại ${formatDateTime(cursor)}`);
      break;
    }

    const values = data.map(r => {
    const utcTime = new Date(Number(r[0]));
    if (isNaN(utcTime.getTime())) {
      console.warn(`⚠️ Bỏ qua dòng có timestamp lỗi: ${r[0]}`);
      return null;
    }

    // Chuyển sang giờ Việt Nam (GMT+7)
    const localTime = new Date(utcTime.getTime() + 7 * 60 * 60 * 1000);

    return [
      symbol,
      localTime.toISOString().slice(0, 19).replace('T', ' '), // Định dạng chuẩn cho MySQL DATETIME
      Number(r[1]),
      Number(r[2]),
      Number(r[3]),
      Number(r[4]),
      Number(r[5])
    ];
  }).filter(Boolean); // Loại bỏ các dòng null

    const placeholders = values.map(() => '(?,?,?,?,?,?,?)').join(',');
    const sql = `
      INSERT INTO okx_kline (symbol, timestamp, open, high, low, close, volume)
      VALUES ${placeholders}
      ON DUPLICATE KEY UPDATE 
        open = VALUES(open),
        high = VALUES(high),
        low = VALUES(low),
        close = VALUES(close),
        volume = VALUES(volume)
    `;

    const [result] = await pool.execute(sql, values.flat());

    cursor = new Date(data[data.length - 1][0]).getTime() + (60 * 60 * 1000); // tăng 1h

    console.log(`✅ ${symbol} - Insert thành công ${data.length} dòng tại ${formatDateTime(cursor)}`);
    console.log(result.insertId);
    cursor += 24 * 60 * 60 * 1000; // Tăng 1 ngày
  }
}

// Chạy tuần tự hoặc song song tuỳ theo bạn
// (async () => {
//   for (let symbol of symbols) {
//     await fetchHistoricalKline_selected(symbol);
//     console.log(`✔️ Done ${symbol}`);
//   }
// })();

// Select HOUR 
async function fetchHistoricalKline_selected_hour(symbol) {
  const windowStart = new Date('2025-09-01T00:00:00Z').getTime();
  const windowEnd   = new Date('2025-09-11T00:00:00Z').getTime();
  console.log(formatDateTime(windowStart), formatDateTime(windowEnd));

  let cursor = windowStart;

  while (cursor < windowEnd) {
    await delay(300);

    const params = new URLSearchParams({
      instId:   symbol,
      bar:      '1H', 
      before:   String(cursor),
      after:    String(windowEnd),
      limit:    '100'
    });

    const url = `https://www.okx.com/api/v5/market/candles?${params}`;
    const resp = await axios.get(url);
    const { code, data } = resp.data;

    if (code !== '0') {
      throw new Error(`OKX API error: ${resp.data.msg || code}`);
    }

    if (!data.length) {
      console.log(`❌ Không có dữ liệu cho ${symbol} tại ${formatDateTime(cursor)}`);
      break;
    }

    const values = data.map(r => {
    const utcTime = new Date(Number(r[0]));
    if (isNaN(utcTime.getTime())) {
      console.warn(`⚠️ Bỏ qua dòng có timestamp lỗi: ${r[0]}`);
      return null;
    }

    // Chuyển sang giờ Việt Nam (GMT+7)
    const localTime = new Date(utcTime.getTime() + 7 * 60 * 60 * 1000);

    return [
      symbol,
      localTime.toISOString().slice(0, 19).replace('T', ' '), // Định dạng chuẩn cho MySQL DATETIME
      Number(r[1]),
      Number(r[2]),
      Number(r[3]),
      Number(r[4]),
      Number(r[5])
    ];
  }).filter(Boolean); // Loại bỏ các dòng null

    const placeholders = values.map(() => '(?,?,?,?,?,?,?)').join(',');
    const sql = `
      INSERT INTO okx_kline_hour (symbol, timestamp, open, high, low, close, volume)
      VALUES ${placeholders}
      ON DUPLICATE KEY UPDATE 
        open = VALUES(open),
        high = VALUES(high),
        low = VALUES(low),
        close = VALUES(close),
        volume = VALUES(volume)
    `;

    const [result] = await pool.execute(sql, values.flat());

    cursor = new Date(data[data.length - 1][0]).getTime() + (60 * 60 * 1000); // tăng 1h

    console.log(`✅ ${symbol} - Insert thành công ${data.length} dòng tại ${formatDateTime(cursor)}`);
    console.log(result.insertId);
    // cursor += 100 * 60 * 60 * 1000; // Tăng 1 ngày
  }
}

// Chạy tuần tự hoặc song song tuỳ theo bạn
// (async () => {
//   for (let symbol of symbols) {
//     await fetchHistoricalKline_selected_hour(symbol);
//     console.log(`✔️ Done ${symbol}`);
//   }
// })();



async function getLastSavedTs(ccy) {
  // Trả về giá trị ms kể từ epoch của ts lớn nhất đã lưu; nếu chưa có, trả về 0
  const [rows] = await pool.execute(
    `SELECT COALESCE(MAX(UNIX_TIMESTAMP(ts) * 1000), 0) AS lastTs
     FROM lending_history
     WHERE ccy = ?`,
    [ccy]
  );

  return rows[0].lastTs;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Lấy lịch sử simple earn
async function fetchAndStoreLendingHistory(ccy) {
  try {
    const startDate = new Date(Date.now() - (60 * 60 * 1000));
    let start = startDate.getTime();

    const nowTs  = Date.now(); 
    // const nowTs  = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)) 

    while (start < nowTs) {
      await delay(200); // 0. Chèn delay 200ms trước khi gọi API để tránh rate-limit
      const params = new URLSearchParams({
        ccy,
        after: String(nowTs), // dữ liệu cũ hơn so với API column ts
        before: String(start), // dữ liệu mới nhất so với API
        limit: '100'
      });
      const path       = `/api/v5/finance/savings/lending-history?${params}`;
      const { code, data }  = await okxRequest('GET', path);
      if (code !== '0') {
        throw new Error(`OKX API error: ${code}`);
      }
      if (!data.length) {
        console.log(`No new records for ${ccy}`);
        break;
      }

      // Lấy ts mới nhất từ MySQL trước đó
      const lastSavedTs = await getLastSavedTs(ccy);

      // Lọc ra những record thực sự mới hơn
      const newData = data.filter(r => Number(r.ts) > lastSavedTs);

      if (!newData.length) {
        console.log(`No new records for ${ccy} since ts ${new Date(lastSavedTs).toISOString()}`);
        break;
      }

      // 3) Chuẩn bị batch parameters và thực thi 1 câu SQL duy nhất
      const values = newData.map(r => [
        r.ccy,
        Number(r.amt),
        Number(r.earnings),
        Number(r.rate),
        new Date(Number(r.ts))
      ]);
      const placeholders = values.map(() => '(?,?,?,?,?)').join(',');
      const sql = `
        INSERT INTO lending_history
          (ccy, amt, earnings, rate, ts)
        VALUES ${placeholders}
        ON DUPLICATE KEY UPDATE earnings = VALUES(earnings)
      `;
      await pool.execute(sql, values.flat());

      console.log(`✅ Saved ${newData.length} records for ${ccy} -- Simple Earn -- since ${new Date(start).toISOString()}`);

      // 4) Cập nhật afterTs bằng timestamp lớn nhất + 1ms
      const maxTs = Math.max(...newData.map(r => Number(r.ts)));
      start = maxTs + 1;
    }
  } catch (err) {
    console.error(`❌ Error fetching lending-history for ${ccy}:`, err.message);
  }
}

cron.schedule('05 * * * *', () => {
  (async () => {
    for (const ccy of ccys) {
      try {
        await fetchAndStoreLendingHistory(ccy);
        console.log(`🎉Simple Earning: ${ccy} complete`);
      } catch (e) {
        console.error(`❌ ${ccy} error:`, e);
      }
    }
  })();

}, { tz: 'Asia/Ho_Chi_Minh' });



async function fetchAndStoreLendingHistory_backup(ccy) {
  try {
    const startDate = new Date(Date.now() - (60 * 60 * 1000));
    let start = startDate.getTime();

    const nowTs  = Date.now(); 
    // const nowTs  = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)) 

    while (start < nowTs) {
      await delay(200); // 0. Chèn delay 200ms trước khi gọi API để tránh rate-limit
      const params = new URLSearchParams({
        ccy,
        after: String(nowTs), // dữ liệu cũ hơn so với API column ts
        before: String(start), // dữ liệu mới nhất so với API
        limit: '100'
      });
      const path       = `/api/v5/finance/savings/lending-history?${params}`;
      const timestamp  = new Date().toISOString();
      const signature  = getSignature(timestamp, 'GET', path);
      const url        = `https://www.okx.com${path}`;

      // 2) Gọi OKX API
      const resp = await axios.get(url, {
        headers: {
          'OK-ACCESS-KEY':        process.env.OKX_API_KEY,
          'OK-ACCESS-SIGN':       signature,
          'OK-ACCESS-TIMESTAMP':  timestamp,
          'OK-ACCESS-PASSPHRASE': process.env.OKX_PASSPHRASE
        }
      });

      const { code, data } = resp.data;
      if (code !== '0') {
        throw new Error(`OKX API error: ${resp.data.msg || code}`);
      }
      if (!data.length) {
        console.log(`No new records for ${ccy}`);
        break;
      }

      // Lấy ts mới nhất từ MySQL trước đó
      const lastSavedTs = await getLastSavedTs(ccy);

      // Lọc ra những record thực sự mới hơn
      const newData = data.filter(r => Number(r.ts) > lastSavedTs);

      if (!newData.length) {
        console.log(`No new records for ${ccy} since ts ${new Date(lastSavedTs).toISOString()}`);
        break;
      }

      // 3) Chuẩn bị batch parameters và thực thi 1 câu SQL duy nhất
      const values = newData.map(r => [
        r.ccy,
        Number(r.amt),
        Number(r.earnings),
        Number(r.rate),
        new Date(Number(r.ts))
      ]);
      const placeholders = values.map(() => '(?,?,?,?,?)').join(',');
      const sql = `
        INSERT INTO lending_history
          (ccy, amt, earnings, rate, ts)
        VALUES ${placeholders}
        ON DUPLICATE KEY UPDATE earnings = VALUES(earnings)
      `;
      await pool.execute(sql, values.flat());

      console.log(`✅ Saved ${newData.length} records for ${ccy} -- Simple Earn -- since ${new Date(start).toISOString()}`);

      // 4) Cập nhật afterTs bằng timestamp lớn nhất + 1ms
      const maxTs = Math.max(...newData.map(r => Number(r.ts)));
      start = maxTs + 1;
    }
  } catch (err) {
    console.error(`❌ Error fetching lending-history for ${ccy}:`, err.message);
  }
}


// // Chạy đồng loạt khi service khởi động;
// (async () => {
//   for (let ccy of ccys) {
//     await fetchAndStoreLendingHistory(ccy);
//     console.log(`✔️ Done ${ccy}`);
//   }
// })();


async function fetchAndStoreLendingHistory_selected2(ccy) {
  const windowStart = new Date('2025-09-10 00:00:00').getTime();
  const windowEnd   = new Date('2025-09-11 08:00:00').getTime();

  // after=timestamp: Yêu cầu API trả về các bản ghi cũ hơn (xảy ra trước) timestamp này.
  // before=timestamp: Yêu cầu API trả về các bản ghi mới hơn (xảy ra sau) timestamp này.

  let cursor        = windowStart;

  while (cursor < windowEnd) {
    await delay(300); 

    const params = new URLSearchParams({
      ccy,
      before:   String(cursor),
      after:    String(windowEnd),
      limit:    '100'
    });
    const path      = `/api/v5/finance/savings/lending-history?${params}`;
    const timestamp = new Date().toISOString();
    const signature = getSignature(timestamp, 'GET', path);
    const url       = `https://www.okx.com${path}`;

    const resp = await axios.get(url, {
      headers: {
        'OK-ACCESS-KEY':        process.env.OKX_API_KEY,
        'OK-ACCESS-SIGN':       signature,
        'OK-ACCESS-TIMESTAMP':  timestamp,
        'OK-ACCESS-PASSPHRASE': process.env.OKX_PASSPHRASE
      }
    });

    const { code, data } = resp.data;
    if (code !== '0') {
      throw new Error(`OKX API error: ${resp.data.msg || code}`);
    }
    if (!data.length) {
      console.log(`Không có dữ liệu của đồng: ${ccy}`);
      break;
    }

    // Chuẩn bị batch INSERT ... ON DUPLICATE KEY UPDATE
    const values = data.map(r => [
      r.ccy,
      Number(r.amt),
      Number(r.earnings),
      Number(r.rate),
      new Date(Number(r.ts))
    ]);
    const placeholders = values.map(() => '(?,?,?,?,?)').join(',');
    const sql = `
      INSERT INTO lending_history
        (ccy, amt, earnings, rate, ts)
      VALUES ${placeholders}
      ON DUPLICATE KEY UPDATE earnings = VALUES(earnings)
    `;
    const [result] = await pool.execute(sql, values.flat());    

    // vòng lặp tiếp theo sẽ đc gắn bởi cursor + 1h
    cursor = cursor + (60*60*1000); //tăng 1h

    console.log(
      `✅ ${ccy} insert Thành công ID: ${result.insertId} - : Có ${data.length} dòng dữ liệu,  được tìm thấy (cursor) tại khung thời gian: ${formatDateTime(cursor)}`
    );
  }
} 

// Chạy tuần tự hoặc song song tuỳ theo bạn
// (async () => {
//   for (let ccy of ccys) {
//     await fetchAndStoreLendingHistory_selected2(ccy);
//     console.log(`✔️ Done ${ccy}`);
//   }
// })();


// Chạy song song các ccys cùng lúc và đợi function chạy xong thì console.log
// setTimeout(async () => {
//   console.log(`🚀 ${yellow('fetchAndStoreLendingHistory_selected2')} - Chương trình rà soát và lưu dữ liệu theo thời gian đang được thực thi, thông chi tiết như sau: `);
//   await Promise.all(ccys.map(ccy => fetchAndStoreLendingHistory_selected2(ccy)));
//   console.log(`✔️ Done `);
// }, 50);


// Chạy MỘT ccy xong console.log
// (async () => {
//   await fetchAndStoreLendingHistory_selected2(a='BERA');
//   console.log(`✔️ Đã refill dữ liệu ${a} thành công`);
// })();



const crypts = ['BERA', 'PARTI', 'KAITO'];

async function insertAverageSimpleEarn(crypt) {
  const sql = `
    INSERT INTO average_simple_earn (ccy, amt, rate, earn, sum_earm)
    SELECT
      ccy,
      ROUND(AVG(amt), 2)        AS amt,
      ROUND(AVG(rate) * 100, 2) AS rate,
      ROUND(AVG(earnings), 3)   AS earn,
      ROUND(SUM(earnings), 3)   AS sum_earm
    FROM lending_history
    WHERE ccy = ?
      AND ts >= CONCAT(DATE_SUB(CURDATE(), INTERVAL 1 DAY), ' 23:00:00')
      AND ts <  CONCAT(CURDATE(),                 ' 23:00:00')
    GROUP BY ccy;
  `;

  try {
    await pool.execute(sql, [crypt]);
    console.log(`✅ [${crypt}] Đã lưu average simple earn thành công`);
  } catch (err) {
    console.error(`❌ [${crypt}] Lỗi insertAverageSimpleEarn:`, err.message);
  }
}

// Lên lịch chạy vào 23:00 hằng ngày (Asia/Ho_Chi_Minh)
cron.schedule('01 23 * * *',
  async () => {
    console.log('🕛 Daily insert start:', new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }));
    for (let crypt of crypts) {
      await insertAverageSimpleEarn(crypt);
    }
  },
  { timezone: 'Asia/Ho_Chi_Minh' }
);



async function insertSimpleEarn(crypt) {
  const sql = `
    WITH
      days AS (
        SELECT DATE_FORMAT(ts, '%Y/%m/%d') AS day
        FROM lending_history
        WHERE ccy = ?
        GROUP BY DATE_FORMAT(ts, '%Y/%m/%d')
      ),
      hours AS (
        SELECT 0 AS hour UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL
        SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL
        SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL
        SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL
        SELECT 12 UNION ALL SELECT 13 UNION ALL SELECT 14 UNION ALL
        SELECT 15 UNION ALL SELECT 16 UNION ALL SELECT 17 UNION ALL
        SELECT 18 UNION ALL SELECT 19 UNION ALL SELECT 20 UNION ALL
        SELECT 21 UNION ALL SELECT 22 UNION ALL SELECT 23
      ),
      core AS (
        SELECT
          id,
          ccy,
          ts,
          DATE_FORMAT(ts, '%Y/%m/%d') AS day,
          CAST(DATE_FORMAT(ts, '%H') AS UNSIGNED) AS hour,
          amt AS amt,
          LEAST(rate * 100, 99.99999999) AS rate,
          earnings
        FROM lending_history
        WHERE ccy = ?
      ),
      full_grid AS (
        SELECT
          core.id,
          COALESCE(core.ccy, ?) AS ccy,
          core.ts,
          days.day,
          hours.hour,
          core.amt,
          core.rate,
          core.earnings
        FROM days
        CROSS JOIN hours
        LEFT JOIN core ON core.day = days.day AND core.hour = hours.hour
      ),
      first_day AS (
        SELECT MIN(STR_TO_DATE(day, '%Y/%m/%d')) AS dt FROM days
      ),
      first_hour AS (
        SELECT MIN(hour) AS hr
        FROM core
        JOIN first_day ON DATE_FORMAT(first_day.dt, '%Y/%m/%d') = core.day
      )
    SELECT
      id,
      ccy,
      ts,
      day,
      LPAD(hour, 2, '0') AS hour,
      COALESCE(amt, 0),
      COALESCE(rate, 0),
      COALESCE(earnings, 0),
      CASE WHEN amt IS NULL THEN 'MISSING' ELSE 'OK' END AS status
    FROM full_grid
    CROSS JOIN first_day
    CROSS JOIN first_hour
    WHERE
      (
        STR_TO_DATE(day, '%Y/%m/%d') < CURDATE()
        OR (
          STR_TO_DATE(day, '%Y/%m/%d') = CURDATE()
          AND hour <= HOUR(NOW())
        )
      )
      AND NOT (
        STR_TO_DATE(day, '%Y/%m/%d') = first_day.dt
        AND hour < first_hour.hr
      )
    ORDER BY STR_TO_DATE(day, '%Y/%m/%d') DESC, hour DESC 
    LIMIT 1
  `;

  try {
    const [rows] = await pool.execute(sql, [crypt, crypt, crypt]);
    if (rows.length === 0) {
      console.warn(`⚠️ [${crypt}] Không có dữ liệu để insert`);
      return;
    }

    const insertSql = `
      INSERT INTO simple_earn (id, ccy, ts, \`day\`, \`hour\`, amt, rate, earnings, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const row = rows[0];
    await pool.execute(insertSql, [
      row.id,
      row.ccy,
      row.ts,
      row.day,
      row.hour,
      row['COALESCE(amt, 0)'],
      row['COALESCE(rate, 0)'],
      row['COALESCE(earnings, 0)'],
      row.status
    ]);

    console.log(`✅ [${crypt}] Đã lưu simple earn thành công`);
  } catch (err) {
    console.error(`❌ [${crypt}] Lỗi insertSimpleEarn:`, err.message);
  }
}


// Lên lịch chạy vào 23:00 hằng ngày (Asia/Ho_Chi_Minh)
cron.schedule('06 * * * *',
  async () => {
    console.log('🕛 Daily insert start:', new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }));
    for (let crypt of crypts) {
      await insertSimpleEarn(crypt);
    }
  },
  { timezone: 'Asia/Ho_Chi_Minh' }
);

// Chạy tuần tự hoặc song song tuỳ theo bạn
// (async () => {
//   for (let crypt of crypts) {
//       await insertSimpleEarn(crypt);
//     console.log(`✔️ Done ${crypt}`);
//   }
// })();






function safeDecimal(value) {
  if (value === '' || value === null || value === undefined) return 0;
  const num = parseFloat(value);
  return isNaN(num) ? 0 : num;
}


// Không cần thiết lắm
async function fetchBalance() {
  const data = await okxRequest('GET', '/api/v5/account/balance');
  const timestamp = new Date();

  for (let item of data.data[0].details) {
    const currency  = item.ccy || 'UNKNOWN';
    const balance   = safeDecimal(item.eq);
    const available = safeDecimal(item.availEq);
    const frozen    = safeDecimal(item.frozenBal);

    await pool.execute(`
      INSERT INTO okx_balance (currency, balance, available, frozen, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `, [currency, balance, available, frozen, timestamp]);
  }

  console.log('✅ Balance inserted');
}

function safeDate(ts) {
  const date = new Date(Number(ts));
  return isNaN(date.getTime()) ? new Date() : date; // fallback về thời gian hiện tại nếu lỗi
}


async function fetchBills() {
  try {
    const response = await okxRequest('GET', '/api/v5/account/bills');
    const bills = response?.data ?? [];

    if (bills.length === 0) {
      console.log('ℹ️ Không có dữ liệu hóa đơn mới');
      return;
    }

    for (const item of bills) {
      const billId   = item.billId;
      const currency = item.ccy || 'UNKNOWN';
      const amount   = safeDecimal(item.balChg);
      const type     = item.type || 'UNKNOWN';
      const ts       = safeDate(item.ts);
      const details  = JSON.stringify(item);

      await pool.execute(`
        INSERT IGNORE INTO okx_bills (bill_id, currency, amount, type, timestamp, details)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [billId, currency, amount, type, ts, details]);
    }

    console.log(`✅ Đã lưu ${bills.length} bản ghi hóa đơn`);
  } catch (err) {
    console.error('❌ Lỗi khi lấy dữ liệu hóa đơn:', err.message);
  }
}
// (async () => {
//   await fetchBills();
// })();

async function fetchAndStoreAccountBillsFlat0() {
  try {
    const response = await okxRequest('GET', '/api/v5/account/bills');
    const bills = response?.data ?? [];

    if (bills.length === 0) {
      console.log('ℹ️ Không có dữ liệu hóa đơn mới');
      return;
    }

    for (const r of bills) {
      const sql = `
        INSERT INTO account_bills (
          bill_id, inst_type, type, sub_type, ts, bal_chg, pos_bal_chg, bal, pos_bal, sz, px, ccy,
          pnl, fee, mgn_mode, inst_id, ord_id, exec_type, from_account, to_account, notes, interest,
          tag, fill_time, trade_id, cl_ord_id, fill_idx_px, fill_mark_px, fill_px_vol, fill_px_usd,
          fill_mark_vol, fill_fwd_px
        ) VALUES (
          ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
        )
        ON DUPLICATE KEY UPDATE
          bal_chg = VALUES(bal_chg),
          fee = VALUES(fee),
          interest = VALUES(interest),
          ts = VALUES(ts)
      `;

      const values = [
        r.billId,
        r.instType ?? null,
        r.type ?? null,
        r.subType ?? null,
        r.ts ? new Date(Number(r.ts)) : null,
        r.balChg ? Number(r.balChg) : null,
        r.posBalChg ? Number(r.posBalChg) : null,
        r.bal ? Number(r.bal) : null,
        r.posBal ? Number(r.posBal) : null,
        r.sz ? Number(r.sz) : null,
        r.px ? Number(r.px) : null,
        r.ccy ?? null,
        r.pnl ? Number(r.pnl) : null,
        r.fee ? Number(r.fee) : null,
        r.mgnMode ?? null,
        r.instId ?? null,
        r.ordId ?? null,
        r.execType ?? null,
        r.from ?? null,
        r.to ?? null,
        r.notes ?? null,
        r.interest ? Number(r.interest) : null,
        r.tag ?? null,
        r.fillTime ? new Date(Number(r.fillTime)) : null,
        r.tradeId ?? null,
        r.clOrdId ?? null,
        r.fillIdxPx ? Number(r.fillIdxPx) : null,
        r.fillMarkPx ? Number(r.fillMarkPx) : null,
        r.fillPxVol ? Number(r.fillPxVol) : null,
        r.fillPxUsd ? Number(r.fillPxUsd) : null,
        r.fillMarkVol ? Number(r.fillMarkVol) : null,
        r.fillFwdPx ? Number(r.fillFwdPx) : null
      ];

      await pool.execute(sql, values);
    }

    console.log(`✅ Đã lưu ${bills.length} bản ghi hóa đơn tài khoản`);
  } catch (err) {
    console.error(`❌ Lỗi khi lấy dữ liệu hóa đơn tài khoản:`, err.message);
  }
}
// (async () => {
//   await fetchAndStoreAccountBillsFlat();
// })();



async function fetchAndStoreAccountBillsFlat() {
  const windowStart = new Date('2025-09-05 00:00:00').getTime();
  const windowEnd   = new Date('2025-09-11 13:00:00').getTime();  
  try {
    let cursor = windowStart;
    let totalSaved = 0;

    while (cursor < windowEnd) {
      await delay(500); 
      const params = new URLSearchParams({
        limit: '100',
        before: String(cursor)
      });

      const response = await okxRequest('GET', `/api/v5/account/bills?${params}`);
      const bills = response?.data ?? [];

      if (bills.length === 0) {
        if (totalSaved === 0) {
          console.log('ℹ️ Không có dữ liệu hóa đơn mới');
        }
        break;
      }

      for (const r of bills) {
        const sql = `
          INSERT INTO account_bills (
            bill_id, inst_type, type, sub_type, ts, bal_chg, pos_bal_chg, bal, pos_bal, sz, px, ccy,
            pnl, fee, mgn_mode, inst_id, ord_id, exec_type, from_account, to_account, notes, interest,
            tag, fill_time, trade_id
          ) VALUES (
            ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
          )
          ON DUPLICATE KEY UPDATE
            bal_chg = VALUES(bal_chg),
            fee = VALUES(fee),
            interest = VALUES(interest),
            ts = VALUES(ts)
        `;

        const values = [
          r.billId,
          r.instType ?? null,
          r.type ?? null,
          r.subType ?? null,
          r.ts ? new Date(Number(r.ts)) : null,
          r.balChg ? Number(r.balChg) : null,
          r.posBalChg ? Number(r.posBalChg) : null,
          r.bal ? Number(r.bal) : null,
          r.posBal ? Number(r.posBal) : null,
          r.sz ? Number(r.sz) : null,
          r.px ? Number(r.px) : null,
          r.ccy ?? null,
          r.pnl ? Number(r.pnl) : null,
          r.fee ? Number(r.fee) : null,
          r.mgnMode ?? null,
          r.instId ?? null,
          r.ordId ?? null,
          r.execType ?? null,
          r.from ?? null,
          r.to ?? null,
          r.notes ?? null,
          r.interest ? Number(r.interest) : null,
          r.tag ?? null,
          r.fillTime ? new Date(Number(r.fillTime)) : null,
          r.tradeId ?? null
        ];

        await pool.execute(sql, values);
      }
      console.log(`✅ Đã thêm ${bills.length} ${response.bill_id} bản ghi mới cho table <account_bills>`);
      totalSaved += bills.length;
      // cursor = bills[bills.length - 1].ts;
      cursor = cursor + (10*60*60*1000);
    }

    console.log(`✅ Đã lưu tổng cộng ${totalSaved} bản ghi hóa đơn tài khoản`);
  } catch (err) {
    if (err.response?.status === 401) {
      console.error('❌ Lỗi xác thực: Kiểm tra API key, secret, passphrase và thời gian hệ thống');
    } else {
      console.error(`❌ Lỗi khi lấy dữ liệu hóa đơn tài khoản:`, err.message);
    }
  }
}


// (async () => {
//   await fetchAndStoreAccountBillsFlat();
//   await delay(500);  
// })();



async function fetchAndStoreAccountBillsFlat90() {

  const windowStart = Date.now()- (1*60*60*1000); // thời điểm cách đây 1 giờ
  const windowEnd   = Date.now();                 // thời điểm hiện tại
  // const windowStart = new Date('2025-05-01 00:00:00').getTime();
  // const windowEnd   = new Date('2025-10-01 00:00:00').getTime();  
  // const windowEnd   = Date.now();
  try {
    let cursor = windowStart;
    
    let totalSaved = 0;

    while (cursor < windowEnd) {
      await delay(500); 
      console.log(green(formatDateTime(cursor)));
      const params = new URLSearchParams({
        limit: '100',
        begin: String(cursor)
        // before: String(windowEnd)        
      });

      const response = await okxRequest('GET', `/api/v5/account/bills-archive?${params}`);
            // for (let item of response.data) {
            //   const billId   = item.billId;
            //   const currency = item.ccy || 'UNKNOWN';
            //   const amount   = safeDecimal(item.balChg);
            //   const type     = item.type || 'UNKNOWN';
            //   const ts       = safeDate(item.ts);
            //   const details  = JSON.stringify(item);

            //   await pool.execute(`
            //     INSERT IGNORE INTO okx_bills (bill_id, currency, amount, type, timestamp, details)
            //     VALUES (?, ?, ?, ?, ?, ?)
            //     ON DUPLICATE KEY UPDATE
            //       bill_id = VALUES(bill_id)
            //   `, [billId, currency, amount, type, ts, details]);
            // };
            // console.log('✅ Bills inserted - OK BÊĐUÊ');
      const bills = response?.data ?? [];
      // console.log(`${red(JSON.stringify(response, null, 2))} `);

      if (bills.length === 0) {
        if (totalSaved === 0) {
          console.log('ℹ️ Không có dữ liệu hóa đơn mới');
        }
        break;
      }

      const filteredBills = bills.filter(r => Number(r.ts) >= windowStart);

      for (const r of filteredBills) {
        const sql = `
          INSERT INTO account_bills (
            bill_id, inst_type, type, sub_type, ts, bal_chg, pos_bal_chg, bal, pos_bal, sz, px, ccy,
            pnl, fee, mgn_mode, inst_id, ord_id, exec_type, from_account, to_account, notes, interest,
            tag, fill_time, trade_id
          ) VALUES (
            ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
          )
          ON DUPLICATE KEY UPDATE
            bill_id = VALUES(bill_id)
        `;

        const values = [
          r.billId,
          r.instType ?? null,
          r.type ?? null,
          r.subType ?? null,
          r.ts ? new Date(Number(r.ts)) : null,
          r.balChg ? Number(r.balChg) : null,
          r.posBalChg ? Number(r.posBalChg) : null,
          r.bal ? Number(r.bal) : null,
          r.posBal ? Number(r.posBal) : null,
          r.sz ? Number(r.sz) : null,
          r.px ? Number(r.px) : null,
          r.ccy ?? null,
          r.pnl ? Number(r.pnl) : null,
          r.fee ? Number(r.fee) : null,
          r.mgnMode ?? null,
          r.instId ?? null,
          r.ordId ?? null,
          r.execType ?? null,
          r.from ?? null,
          r.to ?? null,
          r.notes ?? null,
          r.interest ? Number(r.interest) : null,
          r.tag ?? null,
          r.fillTime ? new Date(Number(r.fillTime)) : null,
          r.tradeId ?? null
        ];

        await pool.execute(sql, values);
        
      }
      console.log(`✅ Đã thêm ${filteredBills.length} bản ghi mới cho ${red('table <account_bills>')}`);
      totalSaved += filteredBills.length;
      cursor = Math.max(...bills.map(b => Number(b.ts))) + 1; // ✅ cập nhật cursor an toàn
      
      // cursor = cursor + (100*60*60*1000);
    }
    console.log('ℹ️ Không còn dữ liệu giao dịch mới');
    console.log(`✅ Đã lưu tổng cộng ${totalSaved} bản ghi cho ${red('table <account_bills>')}`);
    console.log();
  } catch (err) {
    if (err.response?.status === 401) {
      console.error('❌ Lỗi xác thực: Kiểm tra API key, secret, passphrase và thời gian hệ thống');
    } else {
      console.error(`❌ Lỗi khi lấy dữ liệu hóa đơn tài khoản:`, err.message);
    }
  }
}


// (async () => {
//   await fetchAndStoreAccountBillsFlat90();
//   await delay(300);  
// })();

cron.schedule('02 * * * *', async () => {
  console.log(`⏳ 9/2: Tiến trình lưu dữ liệu ${red('TRANSACTION')} thực thi`);
  await fetchAndStoreAccountBillsFlat90();
  
});





function localTime(ts) {
  const utcTime = new Date(Number(ts));
  if (isNaN(utcTime.getTime())) return null;

  // Chuyển sang giờ Việt Nam (GMT+7)
  const localTime = new Date(utcTime.getTime() + 7 * 60 * 60 * 1000);
  return localTime;
}



async function fetchOrders() {
  const path = '/api/v5/trade/orders-history?instType=SPOT';
  const data = await okxRequest('GET', path);

  for (let item of data.data) {
    const orderId  = item.ordId;
    const instId   = item.instId || 'UNKNOWN';
    const side     = item.side || 'UNKNOWN';
    const px       = safeDecimal(item.px);
    const sz       = safeDecimal(item.sz);
    const state    = item.state || 'UNKNOWN';
    const timestamp       = safeDate(item.timestamp);        
    const fillTime = safeDate(item.fillTime); 

    const result = await pool.execute(`
      INSERT IGNORE INTO okx_orders (order_id, instId, side, px, sz, state, timestamp, fill_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [orderId, instId, side, px, sz, state, timestamp, fillTime]);
    const [res] = result;
    if (res.affectedRows > 0 && res.insertId) {
      console.log(`✅ Đã INSERT order mới: ${pink(orderId)}`);
    }
    // else {
    //   console.log(`❌${red('Không')} INSERT order mới: ${pink(orderId)}`);
    // }
  };
  
  
}



async function fetchOrderDetail(ordId, instId) {
  const path = `/api/v5/trade/order?ordId=${ordId}&instId=${instId}`;
  const data = await okxRequest('GET', path);

  if (!data.data || !data.data.length) {
    console.warn(`❌ Không tìm thấy lệnh ${ordId}`);
    return;
  }

  const item = data.data[0];

  const values = [
    item.ordId,
    item.instId || 'UNKNOWN',
    item.side || 'UNKNOWN',
    item.ordType || 'UNKNOWN',
    safeDecimal(item.px),
    safeDecimal(item.sz),
    safeDecimal(item.fee),
    item.state || 'UNKNOWN',
    safeDate(item.ts),
    safeDate(item.fillTime),
    item.pnl || '0' // ✅ Thêm P&L, mặc định là '0' nếu không có
  ];

  const [res] = await pool.execute(`
    INSERT IGNORE INTO okx_order_detail (
      ordId, instId, side, ordType, px, sz, fee, state, ts, fillTime, pnl
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      fee = VALUES(fee),
      state = VALUES(state),
      ts = VALUES(ts),
      fillTime = VALUES(fillTime),
      pnl = VALUES(pnl)
  `, values);

  // console.log(`✅ Đã lưu chi tiết lệnh ${ordId}`);
  // console.log(pink(result));
  // console.log(`${red(JSON.stringify([res], null, 2))} `);
  // if (result.insertId > 0) {
  //     console.log(green(`✅ Dữ liệu INSERT thành công: ${ordId}`), );
  //   };
  if (res.affectedRows > 0 && res.insertId) {
    console.log(`✅ Đã INSERT order mới: ${pink(ordId)}`);
  }
}


async function fetchAllOrderDetails() {
  const [rows] = await pool.execute(`
    SELECT order_id AS ordId, instId FROM okx_orders
    WHERE fill_time IS NOT NULL -- chỉ lấy lệnh đã khớp
  `);

  for (let row of rows) {
    const ordId = row.ordId;
    const instId = row.instId;

    if (!ordId || !instId) {
      console.warn(`⚠️ Thiếu ordId hoặc instId, bỏ qua`);
      continue;
    }

    await fetchOrderDetail(ordId, instId);
  }

  console.log('✅ Đã lấy chi tiết cho tất cả lệnh đã khớp');
}
// (async () => {
//   // await fetchBalance();
//   // await fetchBills();
//   // await fetchOrders();
//   await fetchAllOrderDetails();
// })();

cron.schedule('07 * * * *', async () => {
  console.log('⏳ 1/2: Tiến trình lưu dữ liệu trading thực thi');
  await fetchOrders();
  
});
cron.schedule('09 * * * *', async () => {
  console.log('⏳ 2/2: Tiến trình lưu dữ liệu trading-detail thực thi');
  
  await fetchAllOrderDetails();
});



// Code thực hiện lấy dữ liệu trong khoảng thời gian xác định
async function fetchOrdersInRange() {
  const begin = new Date('2025-06-01T00:00:00Z').getTime(); // milliseconds
  const end = new Date('2025-06-01T23:59:59Z').getTime();     // milliseconds
  

  const path = `/api/v5/trade/orders-history-archive?instType=SPOT&begin=${begin}&end=${end}`;
  const data = await okxRequest('GET', path);

  for (let item of data.data) {
    const orderId  = item.ordId;
    const instId   = item.instId || 'UNKNOWN';
    const side     = item.side || 'UNKNOWN';
    const px       = safeDecimal(item.px);
    const sz       = safeDecimal(item.sz);
    const state    = item.state || 'UNKNOWN';
    const timestamp = safeDate(item.timestamp);        
    const fillTime  = safeDate(item.fillTime); 

    const result = await pool.execute(`
      INSERT IGNORE INTO okx_orders (order_id, instId, side, px, sz, state, timestamp, fill_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [orderId, instId, side, px, sz, state, timestamp, fillTime]);

    const [res] = result;
    if (res.affectedRows > 0 && res.insertId) {
      console.log(`✅ Đã INSERT order mới: ${pink(orderId)}`);
    }
    else{
      console.log(`✅ Không có INSERT order mới trong khoản thời gian: `, formatDateTime(begin), formatDateTime(end));
    }
  }
}
// (async () => {
//   await fetchOrdersInRange();
//   console.log('⏳ 3/2: Tiến trình lưu dữ liệu trading-theo thời gian lựa chọn thực thi');
// })();



// Đây là code quét giao dịch API lưu vào table okx_orders từ cột mốc startDate tới hiện tại
async function fetchOrdersArchiveFullScan(startDate = '2025-06-01T00:00:00Z') {
  const chunkSizeMs = 6 * 60 * 60 * 1000; // 6 giờ
  const now = Date.now();
  let begin = new Date(startDate).getTime();

  while (begin < now) {
    const end = Math.min(begin + chunkSizeMs, now);
    console.log(`🔎 Đang quét từ ${formatDateTime(begin)} đến ${formatDateTime(end)}`);

    let path = `/api/v5/trade/orders-history-archive?instType=SPOT&begin=${begin}&end=${end}`;
    let hasMore = true;
    let after = null;

    while (hasMore) {
      const pagedPath = after ? `${path}&after=${after}` : path;
      const data = await okxRequest('GET', pagedPath);

      if (!data.data || data.data.length === 0) {
        console.log(`⚠️ Không có dữ liệu trong khoảng: ${formatDateTime(begin)} → ${formatDateTime(end)}`);
        break;
      }

      for (let item of data.data) {
        const orderId  = item.ordId;
        const instId   = item.instId || 'UNKNOWN';
        const side     = item.side || 'UNKNOWN';
        const px       = safeDecimal(item.px);
        const sz       = safeDecimal(item.sz);
        const state    = item.state || 'UNKNOWN';
        const timestamp = safeDate(item.timestamp);        
        const fillTime  = safeDate(item.fillTime); 

        // Kiểm tra xem order đã tồn tại chưa
        const [rows] = await pool.execute(`SELECT 1 FROM okx_orders WHERE order_id = ? LIMIT 1`, [orderId]);
        if (rows.length === 0) {
          const result = await pool.execute(`
            INSERT INTO okx_orders (order_id, instId, side, px, sz, state, timestamp, fill_time)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, [orderId, instId, side, px, sz, state, timestamp, fillTime]);

          const [res] = result;
          if (res.affectedRows > 0) {
            console.log(`✅ INSERT order mới: ${pink(orderId)}`);
          }
        } else {
          console.log(`⏩ Đã tồn tại order: ${orderId}`);
        }
      }

      // Nếu có next page
      if (data.data.length === 100) {
        after = data.data[data.data.length - 1].ts;
      } else {
        hasMore = false;
      }
    }

    begin = end;
    await delay(300); // nghỉ nhẹ giữa các lần quét
  }

  console.log('✅ Hoàn tất quét toàn bộ dữ liệu từ 01/06/2025 đến hiện tại');
}

// (async () => {
//   await fetchOrdersArchiveFullScan();
//   console.log('⏳ 4/2: Tiến trình lưu dữ liệu trading-theo FULL-SCAN từ 01/06/2025 thực thi');
// })();



// Đây là code quét giao dịch API trading-detail FULL-SCAN lưu vào table okx_orders từ cột mốc startDate tới hiện tại 
async function fetchFillsHistoryFullScan(startDate = '2025-06-01T00:00:00Z') {
  const chunkSizeMs = 6 * 60 * 60 * 1000; // 6 giờ
  const now = Date.now();
  let begin = new Date(startDate).getTime();

  while (begin < now) {
    const end = Math.min(begin + chunkSizeMs, now);
    console.log(`🔍 Quét fills từ ${formatDateTime(begin)} đến ${formatDateTime(end)}`);

    let path = `/api/v5/trade/fills-history?instType=SPOT&begin=${begin}&end=${end}`;
    let hasMore = true;
    let after = null;

    while (hasMore) {
      const pagedPath = after ? `${path}&after=${after}` : path;
      const data = await okxRequest('GET', pagedPath);

      if (!data.data || data.data.length === 0) {
        console.log(`⚠️ Không có fills trong khoảng: ${formatDateTime(begin)} → ${formatDateTime(end)}`);
        break;
      }

      for (let item of data.data) {
        const ordId    = item.ordId;
        const instId   = item.instId || 'UNKNOWN';
        const side     = item.side || 'UNKNOWN';
        const ordType  = item.ordType || 'UNKNOWN';
        const px       = safeDecimal(item.px);
        const sz       = safeDecimal(item.sz);
        const fee      = safeDecimal(item.fee);
        const state    = item.state || 'UNKNOWN';
        const ts       = safeDate(item.ts);
        const fillTime = safeDate(item.fillTime);
        const pnl      = safeDecimal(item.pnl);

        // Kiểm tra xem fill đã tồn tại chưa
        const [rows] = await pool.execute(`SELECT 1 FROM okx_order_detail WHERE ordId = ? AND ts = ? LIMIT 1`, [ordId, ts]);
        if (rows.length === 0) {
          const result = await pool.execute(`
            INSERT IGNORE INTO okx_order_detail (
                ordId, instId, side, ordType, px, sz, fee, state, ts, fillTime, pnl
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE
                fee = VALUES(fee),
                state = VALUES(state),
                ts = VALUES(ts),
                fillTime = VALUES(fillTime),
                pnl = VALUES(pnl)
          `, [ordId, instId, side, ordType, px, sz, fee, state, ts, fillTime, pnl]);

          const [res] = result;
          if (res.affectedRows > 0) {
            console.log(`✅ INSERT fill mới: ${pink(ordId)} @ ${formatDateTime(ts)}`);
          }
        } else {
          console.log(`⏩ Fill đã tồn tại: ${ordId} @ ${formatDateTime(ts)}`);
        }
      }

      // Nếu có next page
      if (data.data.length === 100) {
        after = data.data[data.data.length - 1].ts;
      } else {
        hasMore = false;
      }
    }

    begin = end;
    await delay(500); // nghỉ nhẹ giữa các lần quét
  }

  console.log('✅ Hoàn tất quét toàn bộ fills từ 01/06/2025 đến hiện tại');
}
// (async () => {
//   await fetchFillsHistoryFullScan();
//   console.log('⏳ 5/2: Tiến trình lưu dữ liệu trading-detail FULL-SCAN từ 01/06/2025 thực thi');
// })();





// Retry thông minh khi bị lỗi 429
async function safeOkxRequest(method, path, body = '', retries = 5, delayMs = 1000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await okxRequest(method, path, body);
    } catch (err) {
      if (err.response?.status === 429) {
        console.warn(`⚠️ Rate limit hit. Retry ${attempt}/${retries} after ${delayMs}ms`);
        await delay(delayMs);
        delayMs *= 2; // tăng dần thời gian chờ
      } else {
        throw err;
      }
    }
  }
  throw new Error(`Exceeded retry limit due to rate limiting`);
}
async function fetchAndStoreSpotBorrowRepayHistory(ccy) {
  try {
    if (!ccy || typeof ccy !== 'string') {
      throw new Error(`Invalid currency code: ${ccy}`);
    }

    let afterTs = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 ngày trước
    const nowTs = Date.now();

    while (afterTs < nowTs) {
      await delay(200); // tránh spam API

      const params = new URLSearchParams({
        ccy,
        after: String(nowTs),
        before: String(afterTs),
        limit: '100'
      });

      const path = `/api/v5/account/spot-borrow-repay-history?${params}`;
      let response;

      try {
        response = await safeOkxRequest('GET', path);
      } catch (apiErr) {
        throw new Error(`API call failed for ${ccy}: ${apiErr.message}`);
      }

      const { code, data, msg } = response;

      if (code !== '0') {
        throw new Error(`OKX API error ${code} for ${ccy}: ${msg || 'Unknown error'}`);
      }

      if (!Array.isArray(data) || data.length === 0) {
        console.warn(`⚠️ Không có dữ liệu trả về cho ${ccy}`);
        break;
      }

      // Ghi log từng bản ghi để kiểm tra giá trị amt
      // data.forEach((r, i) => {
      //   console.log(`🔍 Record ${i}: ccy=${r.ccy}, type=${r.type}, amt=${r.amt}, accBorrowed=${r.accBorrowed}, ts=${r.ts}`);
      // });

      const filteredData = data.filter(r =>
        r.ts && r.type && r.ccy &&
        r.amt !== undefined && r.amt !== null && r.amt !== ''
      );

      if (filteredData.length === 0) {
        console.warn(`⚠️ Không có bản ghi hợp lệ để lưu cho ${ccy}`);
        break;
      }

      const values = filteredData.map(r => [
        r.ccy ?? null,
        r.type ?? null,
        Number(r.amt),
        r.accBorrowed !== undefined && r.accBorrowed !== null && r.accBorrowed !== '' ? Number(r.accBorrowed) : null,
        new Date(Number(r.ts))
      ]);

      const placeholders = values.map(() => '(?,?,?,?,?)').join(',');

      const sql = `
        INSERT INTO spot_borrow_repay_history
          (ccy, type, amt, acc_borrowed, ts)
        VALUES ${placeholders}
        ON DUPLICATE KEY UPDATE
          amt = VALUES(amt),
          acc_borrowed = VALUES(acc_borrowed)
      `;

      try {
        await pool.execute(sql, values.flat());
        console.log(`✅ Đã lưu ${values.length} bản ghi cho ${ccy}`);
      } catch (dbErr) {
        throw new Error(`Database error for ${ccy}: ${dbErr.message}`);}


      const maxTs = Math.max(...filteredData.map(r => Number(r.ts)));
      afterTs = maxTs + 1;
    }
  } catch (err) {
    console.error(`❌ Lỗi khi lấy lịch sử borrow/repay cho ${ccy || 'unknown'}:`, err.message);
  }
}

// Chạy tuần tự từng mã với delay giữa các lần gọi
// (async () => {
//   for (const ccy of ccys) {
//     await fetchAndStoreSpotBorrowRepayHistory(ccy);
//     await delay(1000); // delay 1 giây giữa các đồng để tránh bị chặn
//   }
// })();

cron.schedule('04 * * * *', () => {
(async () => {
  for (const ccy of ccys) {
    await fetchAndStoreSpotBorrowRepayHistory(ccy);
    await delay(1000); // delay 1 giây giữa các đồng để tránh bị chặn
  }
})();
}, { tz: 'Asia/Ho_Chi_Minh' });









async function fetchAndStoreInterestAccrued0(ccy) {
  try {
    const path = `/api/v5/account/interest-accrued?${new URLSearchParams({ ccy, limit: '100' })}`;
    const response = await safeOkxRequest('GET', path);

    const { code, data, msg } = response;
    if (code !== '0') throw new Error(`OKX API error ${code}: ${msg || 'Unknown error'}`);
    if (!Array.isArray(data) || data.length === 0) {
      console.warn(`⚠️ Không có dữ liệu lãi suất tích lũy cho ${ccy}`);
      return;
    }

    // Ghi log để kiểm tra dữ liệu
    // data.forEach((r, i) => {
    //   console.log(`🔍 [${i}] ccy=${r.ccy}, interest=${r.interest}, interestRate=${r.interestRate}, liab=${r.liab}, ts=${r.ts}`);
    // });

    const values = data.map(r => [
      r.ccy ?? null,
      r.interest ? Number(r.interest) : null,
      r.interestRate ? Number(r.interestRate) : null,
      r.liab ? Number(r.liab) : null,
      r.ts ? new Date(Number(r.ts)) : null
    ]);

    const sql = `
      INSERT INTO interest_accrued
        (ccy, interest, interest_rate, liab, ts)
      VALUES ${values.map(() => '(?,?,?,?,?)').join(',')}
      ON DUPLICATE KEY UPDATE
        interest = VALUES(interest),
        interest_rate = VALUES(interest_rate),
        liab = VALUES(liab)
    `;

    await pool.execute(sql, values.flat());
    console.log(`✅ Đã lưu ${values.length} bản ghi lãi suất cho ${ccy}`);
  } catch (err) {
    console.error(`❌ Lỗi khi lấy dữ liệu lãi suất tích lũy cho ${ccy}:`, err.message);
  }
}







async function fetchAndStoreInterestAccrued(ccy) {
  try {
    const path = `/api/v5/account/interest-accrued?${new URLSearchParams({ ccy, limit: '100' })}`;
    const response = await safeOkxRequest('GET', path);

    const { code, data, msg } = response;
    if (code !== '0') throw new Error(`OKX API error ${code}: ${msg || 'Unknown error'}`);
    if (!Array.isArray(data) || data.length === 0) {
      console.warn(`⚠️ Không có dữ liệu lãi suất tích lũy cho ${ccy}`);
      return;
    }

    // Lấy danh sách timestamp đã tồn tại trong DB
    const existingTsQuery = `
      SELECT ts FROM interest_accrued WHERE ccy = ?
    `;
    const [existingRows] = await pool.execute(existingTsQuery, [ccy]);
    const existingTimestamps = new Set(existingRows.map(row => row.ts.getTime()));

    // Lọc ra bản ghi mới
    const newRecords = data.filter(r => {
      const ts = r.ts ? Number(r.ts) : null;
      return ts && !existingTimestamps.has(ts);
    });

    if (newRecords.length === 0) {
      console.log(`ℹ️ Không có bản ghi mới cho ${ccy}`);
      return;
    }

    const values = newRecords.map(r => [
      r.ccy ?? null,
      r.interest ? Number(r.interest) : null,
      r.interestRate ? Number(r.interestRate) : null,
      r.liab ? Number(r.liab) : null,
      r.ts ? new Date(Number(r.ts)) : null
    ]);

    const sql = `
      INSERT INTO interest_accrued
        (ccy, interest, interest_rate, liab, ts)
      VALUES ${values.map(() => '(?,?,?,?,?)').join(',')}
    `;

    await pool.execute(sql, values.flat());
    console.log(`✅ Đã thêm ${values.length} bản ghi nợk nầk chồnk chấk mới cho ${ccy}`);
  } catch (err) {
    console.error(`❌ Lỗi khi lấy dữ liệu lãi suất tích lũy cho ${ccy}:`, err.message);
  }
}
// (async () => {
//   for (const ccy of ccys) {
//     await fetchAndStoreInterestAccrued(ccy);
//     await delay(1000); // tránh bị chặn
//   }
// })();

cron.schedule('04 * * * *', () => {
(async () => {
  for (const ccy of ccys) {
    await fetchAndStoreInterestAccrued(ccy);
    await delay(1000); // delay 1 giây giữa các đồng để tránh bị chặn
  }
})();
}, { tz: 'Asia/Ho_Chi_Minh' });




async function fetchAllInterestAccrued_selected(ccy) {
  const windowStart = new Date('2025-09-10 15:00:00').getTime();
  const windowEnd   = new Date('2025-09-11 09:00:00').getTime();  

  try {
    let cursor = windowStart;
    let totalNewRecords = 0;

    while (cursor < windowEnd) {
      await delay(500); 
      const params = new URLSearchParams({
        ccy,
        limit: '100',
        before: String(cursor)
        // after: String(windowEnd)        
      });

      const path = `/api/v5/account/interest-accrued?${params}`;
      const response = await safeOkxRequest('GET', path);

      const { code, data, msg } = response;
      if (code !== '0') throw new Error(`OKX API error ${code}: ${msg || 'Unknown error'}`);
      if (!Array.isArray(data) || data.length === 0) {
        console.log(`✅ Đã hoàn tất lấy dữ liệu cho ${ccy}`);
        break;
      }

      // Lấy timestamp đã có trong DB
      const [existingRows] = await pool.execute(
        `SELECT ts FROM interest_accrued WHERE ccy = ?`,
        [ccy]
      );
      const existingTsSet = new Set(existingRows.map(row => row.ts.getTime()));

      // Lọc bản ghi mới
      const newRecords = data.filter(r => {
        const ts = r.ts ? Number(r.ts) : null;
        return ts && !existingTsSet.has(ts);
      });

      if (newRecords.length === 0) {
        console.log(`ℹ️ Không có bản ghi mới trong đoạn ${formatDateTime(cursor)} → ${formatDateTime(windowEnd)} cho ${ccy}`);
        break;
      }

      const values = newRecords.map(r => [
        r.ccy ?? null,
        r.interest ? Number(r.interest) : null,
        r.interestRate ? Number(r.interestRate) : null,
        r.liab ? Number(r.liab) : null,
        r.ts ? new Date(Number(r.ts)) : null
      ]);

      const sql = `
        INSERT INTO interest_accrued
          (ccy, interest, interest_rate, liab, ts)
        VALUES ${values.map(() => '(?,?,?,?,?)').join(',')}
      `;

      await pool.execute(sql, values.flat());
      console.log(`✅ Đã thêm ${values.length} bản ghi mới cho ${ccy}`);
      totalNewRecords += values.length;

      // Cập nhật cursor theo bản ghi mới nhất
      // cursor = Math.max(...newRecords.map(r => Number(r.ts))) + 1;

      cursor = cursor - (100*60*60*1000); // tăng 100h trở về quá khứ để vòng lặp mới limit 100 bắt đầu      
    }

    console.log(`🎯 Tổng cộng đã thêm ${totalNewRecords} bản ghi mới cho ${ccy}`);
  } catch (err) {
    console.error(`❌ Lỗi khi lấy dữ liệu lãi suất tích lũy cho ${ccy}:`, err.message);
  }
}
// (async () => {
//     await fetchAllInterestAccrued('USDT');
//     await delay(500);  
// })();


// (async () => {
//   for (const ccy of ccys) {
//     await fetchAllInterestAccrued('USDT');
//     await delay(1000);
//   }
// })();







const billTypes = {
  1: 'Transfer',
  2: 'Trade',
  3: 'Delivery',
  4: 'Forced repayment',
  5: 'Liquidation',
  6: 'Margin transfer',
  7: 'Interest deduction',
  8: 'Funding fee',
  9: 'ADL',
  10: 'Clawback',
  11: 'System token conversion',
  12: 'Strategy transfer',
  13: 'DDH',
  14: 'Block trade',
  15: 'Quick Margin',
  16: 'Borrowing',
  22: 'Repay',
  24: 'Spread trading',
  26: 'Structured products',
  27: 'Convert',
  28: 'Easy convert',
  29: 'One-click repay',
  30: 'Simple trade',
  32: 'Move position',
  33: 'Loans',
  34: 'Settlement',
  250: 'Copy trader profit sharing expenses',
  251: 'Copy trader profit sharing refund'
};

const billSubtypes = {
  1: 'Buy',
  2: 'Sell',
  3: 'Open long',
  4: 'Open short',
  5: 'Close long',
  6: 'Close short',
  9: 'Interest deduction for Market loans',
  11: 'Transfer in',
  12: 'Transfer out',
  14: 'Interest deduction for VIP loans',
  16: 'Repay forcibly',
  17: 'Repay interest by borrowing forcibly',
  100: 'Partial liquidation close long',
  101: 'Partial liquidation close short',
  102: 'Partial liquidation buy',
  103: 'Partial liquidation sell',
  104: 'Liquidation long',
  105: 'Liquidation short',
  106: 'Liquidation buy',
  107: 'Liquidation sell',
  108: 'Clawback',
  110: 'Liquidation transfer in',
  111: 'Liquidation transfer out',
  112: 'Delivery long',
  113: 'Delivery short',
  114: 'Forced repayment buy',
  115: 'Forced repayment sell',
  117: 'Delivery/Exercise clawback',
  118: 'System token conversion transfer in',
  119: 'System token conversion transfer out',
  125: 'ADL close long',
  126: 'ADL close short',
  127: 'ADL buy',
  128: 'ADL sell',
  131: 'ddh buy',
  132: 'ddh sell',
  160: 'Manual margin increase',
  161: 'Manual margin decrease',
  162: 'Auto margin increase',
  170: 'Exercised(ITM buy side)',
  171: 'Counterparty exercised(ITM sell side)',
  172: 'Expired(Non-ITM buy and sell side)',
  173: 'Funding fee expense',
  174: 'Funding fee income',
  200: 'System transfer in',
  201: 'Manually transfer in',
  202: 'System transfer out',
  203: 'Manually transfer out',
  204: 'block trade buy',
  205: 'block trade sell',
  206: 'block trade open long',
  207: 'block trade open short',
  208: 'block trade close long',
  209: 'block trade close short',
  210: 'Manual Borrowing of quick margin',
  211: 'Manual Repayment of quick margin',
  212: 'Auto borrow of quick margin',
  213: 'Auto repay of quick margin',
  220: 'Transfer in when using USDT to buy OPTION',
  221: 'Transfer out when using USDT to buy OPTION',
  224: 'Repayment transfer in',
  225: 'Repayment transfer out',
  236: 'Easy convert in',
  237: 'Easy convert out',
  250: 'Profit sharing expenses',
  251: 'Profit sharing refund',
  270: 'Spread trading buy',
  271: 'Spread trading sell',
  272: 'Spread trading open long',
  273: 'Spread trading open short',
  274: 'Spread trading close long',
  275: 'Spread trading close short',
  280: 'SPOT profit sharing expenses',
  281: 'SPOT profit sharing refund',
  282: 'Spot profit share income',
  283: 'Asset transfer for spot copy trading',
  284: 'Copy trade automatic transfer in',
  285: 'Copy trade manual transfer in',
  286: 'Copy trade automatic transfer out',
  287: 'Copy trade manual transfer out',
  290: 'Crypto dust auto-transfer out',
  293: 'Fixed loan interest deduction',
  294: 'Fixed loan interest refund',
  295: 'Fixed loan overdue penalty',
  296: 'From structured order placements',
  297: 'To structured order placements',
  298: 'From structured settlements',
  299: 'To structured settlements',
  306: 'Manual borrow',
  307: 'Auto borrow',
  308: 'Manual repay',
  309: 'Auto repay',
  312: 'Auto offset',
  318: 'Convert in',
  319: 'Convert out',
  320: 'Simple buy',
  321: 'Simple sell',
  324: 'Move position buy',
  325: 'Move position sell',
  326: 'Move position open long',
  327: 'Move position open short',
  328: 'Move position close long',
  329: 'Move position close short',
  332: 'Margin transfer in isolated margin position',
  333: 'Margin transfer out isolated margin position',
  334: 'Margin loss when closing isolated margin position',
  355: 'Settlement PnL',
  376: 'Collateralized borrowing auto conversion buy',
  377: 'Collateralized borrowing auto conversion sell',
  381: 'Auto lend interest transfer in',
  372: 'Bot airdrop (transfer in)',
  373: 'Bot airdrop (transfer out)',
  374: 'Bot airdrop reclaim (transfer in)',
  375: 'Bot airdrop reclaim (transfer out)'
};

// for (const [code, name] of Object.entries(billTypes)) {
//   (async () => {
//   await pool.execute(
//     `INSERT INTO okx_bill_types (type_code, type_name) VALUES (?, ?)`,
//     [Number(code), name]
//   );
//   })();
// }

// for (const [code, name] of Object.entries(billSubtypes)) {
//   (async () => {
//   await pool.execute(
//     `INSERT INTO okx_bill_subtypes (subtype_code, subtype_name) VALUES (?, ?)`,
//     [Number(code), name]
//   );
//   })();
// }

