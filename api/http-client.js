const axios = require('axios');

class HttpClient {
  constructor() {
    this.cookies = {};
  }

  getCookieString() {
    const cookieEntries = Object.entries(this.cookies);
    return cookieEntries.length > 0
      ? cookieEntries.map(([name, value]) => `${name}=${value}`).join('; ')
      : '';
  }

  updateCookiesFromResponse(response) {
    const setCookieHeaders = response.headers['set-cookie'];
    if (setCookieHeaders) {
      setCookieHeaders.forEach(cookieHeader => {
        const cookieMatch = cookieHeader.match(/^([^=]+)=([^;]+)/);
        if (cookieMatch) {
          const [, name, value] = cookieMatch;
          this.cookies[name] = value;
        }
      });
    }
  }

  ensureAbsoluteUrl(url) {
    return url && !url.startsWith('http') ? `https://www.critic.de${url}` : url;
  }

  async post(url, formData) {
    const response = await axios.post(url, formData, {
      headers: {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
        'cache-control': 'no-cache',
        'content-type': 'application/x-www-form-urlencoded',
        'origin': 'https://www.critic.de',
        'pragma': 'no-cache',
        'priority': 'u=0, i',
        'referer': 'https://www.critic.de/ov-movies-berlin/',
        'sec-ch-ua': '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'same-origin',
        'sec-fetch-user': '?1',
        'upgrade-insecure-requests': '1',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        'cookie': this.getCookieString()
      },
      timeout: 30000,
      httpsAgent: new (require('https').Agent)({
        rejectUnauthorized: false,
        secureProtocol: 'TLSv1_2_method'
      }),
      maxRedirects: 5,
      validateStatus: function (status) {
        return status >= 200 && status < 400;
      }
    });

    this.updateCookiesFromResponse(response);
    return response;
  }
}

module.exports = HttpClient;
