/**
 * IBKR Flex Web Service. Token stays on the server.
 * SendRequest returns a reference code; GetStatement is polled until the CSV is ready.
 */

const SEND_URL = 'https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/SendRequest';
const GET_URL = 'https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/GetStatement';

function tag(xml, name) {
  const match = String(xml).match(new RegExp(`<${name}[^>]*>([^<]*)</${name}>`, 'i'));
  return match ? match[1].trim() : '';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function flexGet(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'peleg-trading-api/1.0' },
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  return text;
}

export async function fetchFlexStatement({ token, queryId }) {
  if (!token || !queryId) {
    const err = new Error('Flex token or query id is not configured.');
    err.status = 503;
    throw err;
  }

  const send = new URL(SEND_URL);
  send.searchParams.set('t', token);
  send.searchParams.set('q', String(queryId));
  send.searchParams.set('v', '3');

  const sendText = await flexGet(send);
  const sendStatus = tag(sendText, 'Status').toLowerCase();
  if (!sendText.includes('<FlexStatementResponse') || (sendStatus && sendStatus !== 'success')) {
    const err = new Error(tag(sendText, 'ErrorMessage') || 'IBKR rejected the Flex request.');
    err.status = 502;
    throw err;
  }

  const reference = tag(sendText, 'ReferenceCode');
  const statementUrl = tag(sendText, 'Url') || GET_URL;
  if (!reference) {
    const err = new Error('IBKR did not return a Flex reference code.');
    err.status = 502;
    throw err;
  }

  let lastMessage = 'Flex statement was not ready.';
  for (let attempt = 0; attempt < 8; attempt++) {
    await sleep(attempt === 0 ? 2000 : 3000);
    const get = new URL(statementUrl);
    get.searchParams.set('q', reference);
    get.searchParams.set('t', token);
    get.searchParams.set('v', '3');
    const text = await flexGet(get);

    if (!text.includes('<FlexStatementResponse')) {
      if (text.trim()) return text;
      continue;
    }

    const status = tag(text, 'Status').toLowerCase();
    const code = tag(text, 'ErrorCode');
    lastMessage = tag(text, 'ErrorMessage') || lastMessage;
    if (code === '1019' || /in progress/i.test(lastMessage)) continue;
    if (status === 'success' && /symbol/i.test(text) && /quantity/i.test(text)) return text;
    if (status && status !== 'success') {
      const err = new Error(lastMessage || `Flex error ${code}`);
      err.status = 502;
      throw err;
    }
  }

  const err = new Error(`${lastMessage} Try the pull again in a minute.`);
  err.status = 502;
  throw err;
}
