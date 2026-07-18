# Meesho Bulk Image Uploader

Plain HTML/CSS/JavaScript frontend with a dependency-free Node.js proxy. The proxy is necessary because a browser page cannot set Meesho session cookies or other protected request headers directly.

## Run

Requires Node.js 18 or newer.

```powershell
npm.cmd start
```

Open `http://127.0.0.1:3000`, paste a fresh cURL copied from the Meesho bulk image upload request, choose multiple images, and click **Upload all**.

For an online HTML viewer, the visual page can render but uploads cannot work as a static-only file. Deploy both `index.html` and `server.js` to a Node.js host, then open the hosted URL. The session is stored only in server memory and is lost on restart.

## Security

- Do not share the pasted cURL; it contains an authenticated session.
- Run on localhost or a private, access-controlled host.
- The server accepts only the exact supported `supplier.meesho.com` upload endpoint.
