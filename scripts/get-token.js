const http = require('http');
const { URL } = require('url');
const readline = require('readline');

const TENANT = 'consumers';
const REDIRECT_URI = 'http://localhost:3847/callback';
const SCOPES = 'offline_access Calendars.ReadWrite';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function ask(q) { return new Promise(r => rl.question(q, r)); }

(async () => {
  const clientId = await ask('Enter your Azure App Client ID: ');
  const clientSecret = await ask('Enter your Azure App Client Secret: ');

  const authUrl = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize?` +
    `client_id=${encodeURIComponent(clientId)}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&response_mode=query`;

  console.log('\n1. Open this URL in your browser:\n');
  console.log(authUrl);
  console.log('\n2. Sign in with kyrkost@outlook.com and click Accept');
  console.log('3. You will be redirected to localhost — the script will capture the code.\n');

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://localhost:3847');
      const authCode = u.searchParams.get('code');
      if (authCode) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h2>Done! You can close this tab.</h2>');
        server.close();
        resolve(authCode);
      } else {
        res.writeHead(400);
        res.end('Missing code parameter');
      }
    });
    server.listen(3847, () => console.log('Waiting for redirect on http://localhost:3847/callback ...'));
    server.on('error', reject);
  });

  console.log('\nGot authorization code. Exchanging for tokens...\n');

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code: code,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
    scope: SCOPES
  });

  const res = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

  const data = await res.json();

  if (data.error) {
    console.error('Error:', data.error_description || data.error);
    process.exit(1);
  }

  console.log('=== SUCCESS ===\n');
  console.log('REFRESH TOKEN (save this as MS_REFRESH_TOKEN in GitHub Secrets):\n');
  console.log(data.refresh_token);
  console.log('\nAccess token (for testing, expires in ~1 hour):');
  console.log(data.access_token?.substring(0, 40) + '...');
  console.log('\nDone! Now add these GitHub Secrets:');
  console.log(`  MS_CLIENT_ID = ${clientId}`);
  console.log(`  MS_CLIENT_SECRET = ${clientSecret}`);
  console.log(`  MS_REFRESH_TOKEN = <the refresh token above>`);

  rl.close();
})();
